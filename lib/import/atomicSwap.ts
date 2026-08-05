import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";
import {
  LIVE_TABLE,
  LIVE_FTS_TABLE,
  LIVE_CATALOG_FTS_TABLE,
  STAGING_TABLE,
  STAGING_FTS_TABLE,
  STAGING_CATALOG_FTS_TABLE,
  PREVIOUS_TABLE,
  PREVIOUS_FTS_TABLE,
  PREVIOUS_CATALOG_FTS_TABLE,
} from "@/lib/db/ddl";
import { buildStagingTables, type ProgressFn } from "./importCsv";

// importAndSwap/restorePrevious both rename tables in the same database.
// Two of these running concurrently (a double-click, two admin tabs, two
// Vercel serverless instances handling overlapping requests, a leftover
// process from a previous test, etc.) would race on the same
// staging/previous table names.
//
// An in-process boolean is NOT sufficient here — confirmed by actually
// corrupting the live table this way while testing: a standalone CLI
// import and an in-flight HTTP-triggered import (whose client had already
// given up waiting, but which kept running server-side) both rebuilt
// records_new concurrently as two separate OS processes, each with its
// own independent lock variable, and one of them swapped an empty/partial
// table into the live slot. On Vercel specifically, concurrent requests
// can land on genuinely separate instances with separate memory, so the
// lock has to live in the database itself, not in process memory.
const LOCK_TABLE = "import_lock";
// A resumable import runs as a series of separate function invocations. If one
// is KILLED at the platform time limit it can't release the lock, so the lock
// must expire on its own quickly — but not so quickly that it's stolen from a
// still-running pass. The holder heartbeats the lock every HEARTBEAT_MS; the
// lock is considered abandoned only after STALE_LOCK_MS of NO heartbeat (a few
// missed beats), which a live pass never reaches but a killed one hits fast.
const HEARTBEAT_MS = 15_000;
const STALE_LOCK_MS = 50_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureLockTable(): Promise<void> {
  const client = await getClient();
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${LOCK_TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), locked_at TEXT NOT NULL)`
  );
}

/** Acquires the import lock, optionally waiting for a stale/abandoned lock to
 * clear (used by the resumable diff so a follow-up pass can take over from a
 * killed one). With maxWaitMs = 0 it fails fast if the lock is held and fresh. */
export async function acquireLock(opts?: {
  maxWaitMs?: number;
  onWait?: (message: string) => void;
}): Promise<void> {
  const client = await getClient();
  await ensureLockTable();
  const deadline = Date.now() + (opts?.maxWaitMs ?? 0);

  for (;;) {
    const existing = await client.execute(`SELECT locked_at FROM ${LOCK_TABLE} WHERE id = 1`);
    const lockedAt = existing.rows[0]?.locked_at as string | undefined;
    const stale = !lockedAt || Date.now() - new Date(lockedAt).getTime() > STALE_LOCK_MS;

    if (stale) {
      if (lockedAt) await client.execute(`DELETE FROM ${LOCK_TABLE} WHERE id = 1`);
      try {
        await client.execute(`INSERT INTO ${LOCK_TABLE} (id, locked_at) VALUES (1, ?)`, [
          new Date().toISOString(),
        ]);
        return;
      } catch {
        // Lost a race with another acquirer — fall through and retry/wait.
      }
    }

    if (Date.now() >= deadline) {
      throw new Error(
        "Another import or restore is already in progress. Wait for it to finish and try again."
      );
    }
    opts?.onWait?.("Waiting for the previous import pass to finish before continuing…");
    await sleep(3000);
  }
}

async function touchLock(): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: `UPDATE ${LOCK_TABLE} SET locked_at = ? WHERE id = 1`,
    args: [new Date().toISOString()],
  });
}

/** Starts heartbeating the lock so it stays fresh while this pass runs; returns
 * a stop function to call when the pass ends. Self-scheduling (waits for each
 * write before scheduling the next) so slow writes can't pile up. */
export function startLockHeartbeat(): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    await touchLock().catch(() => {});
    if (!stopped) timer = setTimeout(tick, HEARTBEAT_MS);
  };
  timer = setTimeout(tick, HEARTBEAT_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export async function releaseLock(): Promise<void> {
  const client = await getClient();
  await client.execute(`DELETE FROM ${LOCK_TABLE} WHERE id = 1`).catch(() => {});
}

/** Against a remote Turso database, buildStagingTables makes many network
 * round trips (batched, but still many) — a single transient timeout
 * shouldn't fail the whole import (confirmed by testing: this happened for
 * real against a live Turso database). Retrying the whole build is safe
 * because it always drops and fully rebuilds records_new from scratch. */
async function buildStagingTablesWithRetry(
  csvBuffer: Buffer,
  onProgress?: ProgressFn
): Promise<{ rowCount: number }> {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      return await buildStagingTables(csvBuffer, onProgress);
    } catch (err) {
      if (i === attempts - 1) throw err;
      const message = err instanceof Error ? err.message : String(err);
      onProgress?.(`A database error interrupted the save (${message}). Retrying (attempt ${i + 2} of ${attempts})…`);
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

async function tableExists(name: string): Promise<boolean> {
  const client = await getClient();
  const res = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return res.rows.length > 0;
}

async function countRows(table: string): Promise<number> {
  const client = await getClient();
  const res = await client.execute(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(res.rows[0]?.c ?? 0);
}

// Small standalone table (not part of the swap rotation) recording when the
// live data last changed. There's no filesystem mtime to fall back on once
// this can run against a remote Turso database, so track it explicitly.
export async function stampUpdatedNow(): Promise<void> {
  const client = await getClient();
  await client.execute(
    `CREATE TABLE IF NOT EXISTS import_meta (id INTEGER PRIMARY KEY CHECK (id = 1), updated_at TEXT NOT NULL)`
  );
  await client.execute({
    sql: `INSERT INTO import_meta (id, updated_at) VALUES (1, ?)
          ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
    args: [new Date().toISOString()],
  });
}

async function getLastUpdated(): Promise<string | null> {
  const client = await getClient();
  try {
    const res = await client.execute("SELECT updated_at FROM import_meta WHERE id = 1");
    return (res.rows[0]?.updated_at as string) ?? null;
  } catch {
    return null;
  }
}

export interface ImportResult {
  rowCount: number;
  previousRowCount: number | null;
  lowRowCountWarning: boolean;
}

/** Parses the CSV into staging tables, then atomically (single SQL
 * transaction) renames the live tables to "previous" and the staging
 * tables into the live table names. Works identically against a local
 * SQLite file or a remote Turso database — it's all just SQL. */
export async function importAndSwap(
  csvBuffer: Buffer,
  onProgress?: ProgressFn
): Promise<ImportResult> {
  await acquireLock();
  const stopHeartbeat = startLockHeartbeat();
  try {
    const { rowCount } = await buildStagingTablesWithRetry(csvBuffer, onProgress);

    onProgress?.("Swapping the new catalogue into place…");
    const client = await getClient();
    const liveExists = await tableExists(LIVE_TABLE);
    // Checked independently of liveExists: a `records` table created before
    // catalog_fts existed has no `records_catalog_fts` sibling to rename
    // away, which would otherwise fail the transaction on the very first
    // import after this feature ships.
    const liveCatalogFtsExists = liveExists && (await tableExists(LIVE_CATALOG_FTS_TABLE));
    const previousRowCount = liveExists ? await countRows(LIVE_TABLE) : null;

    const tx = await client.transaction("write");
    try {
      const statements = [
        `DROP TABLE IF EXISTS ${PREVIOUS_FTS_TABLE}`,
        `DROP TABLE IF EXISTS ${PREVIOUS_CATALOG_FTS_TABLE}`,
        `DROP TABLE IF EXISTS ${PREVIOUS_TABLE}`,
        ...(liveExists
          ? [
              `ALTER TABLE ${LIVE_TABLE} RENAME TO ${PREVIOUS_TABLE}`,
              `ALTER TABLE ${LIVE_FTS_TABLE} RENAME TO ${PREVIOUS_FTS_TABLE}`,
            ]
          : []),
        ...(liveCatalogFtsExists
          ? [`ALTER TABLE ${LIVE_CATALOG_FTS_TABLE} RENAME TO ${PREVIOUS_CATALOG_FTS_TABLE}`]
          : []),
        `ALTER TABLE ${STAGING_TABLE} RENAME TO ${LIVE_TABLE}`,
        `ALTER TABLE ${STAGING_FTS_TABLE} RENAME TO ${LIVE_FTS_TABLE}`,
        `ALTER TABLE ${STAGING_CATALOG_FTS_TABLE} RENAME TO ${LIVE_CATALOG_FTS_TABLE}`,
      ];
      await tx.batch(statements);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    await stampUpdatedNow();
    onProgress?.(`Done — the catalogue now has ${rowCount.toLocaleString()} records.`);

    const lowRowCountWarning =
      previousRowCount != null && rowCount < previousRowCount * 0.5;

    return { rowCount, previousRowCount, lowRowCountWarning };
  } finally {
    stopHeartbeat();
    await releaseLock();
  }
}

/** Swaps the live tables back with the previous generation. A true 3-way
 * swap (not a drop), so a restore can itself be undone by calling this
 * again — same property the old file-based version had. */
export async function restorePrevious(): Promise<void> {
  await acquireLock();
  const stopHeartbeat = startLockHeartbeat();
  try {
    if (!(await tableExists(PREVIOUS_TABLE))) {
      throw new Error("No previous database version to restore.");
    }

    // Independent existence checks: a generation created before catalog_fts
    // existed has no `*_catalog_fts` sibling to rename — same transitional
    // case as importAndSwap above.
    const liveCatalogFtsExists = await tableExists(LIVE_CATALOG_FTS_TABLE);
    const previousCatalogFtsExists = await tableExists(PREVIOUS_CATALOG_FTS_TABLE);

    const client = await getClient();
    const tx = await client.transaction("write");
    try {
      await tx.batch([
        `ALTER TABLE ${LIVE_TABLE} RENAME TO records_swap_tmp`,
        `ALTER TABLE ${LIVE_FTS_TABLE} RENAME TO records_swap_tmp_fts`,
        ...(liveCatalogFtsExists
          ? [`ALTER TABLE ${LIVE_CATALOG_FTS_TABLE} RENAME TO records_swap_tmp_catalog_fts`]
          : []),
        `ALTER TABLE ${PREVIOUS_TABLE} RENAME TO ${LIVE_TABLE}`,
        `ALTER TABLE ${PREVIOUS_FTS_TABLE} RENAME TO ${LIVE_FTS_TABLE}`,
        ...(previousCatalogFtsExists
          ? [`ALTER TABLE ${PREVIOUS_CATALOG_FTS_TABLE} RENAME TO ${LIVE_CATALOG_FTS_TABLE}`]
          : []),
        `ALTER TABLE records_swap_tmp RENAME TO ${PREVIOUS_TABLE}`,
        `ALTER TABLE records_swap_tmp_fts RENAME TO ${PREVIOUS_FTS_TABLE}`,
        ...(liveCatalogFtsExists
          ? [`ALTER TABLE records_swap_tmp_catalog_fts RENAME TO ${PREVIOUS_CATALOG_FTS_TABLE}`]
          : []),
      ]);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    await stampUpdatedNow();
  } finally {
    stopHeartbeat();
    await releaseLock();
  }
}

// Cached: the home page reads this on every visit. Invalidated immediately on
// import/restore (CATALOGUE_TAG); the 5-minute revalidate is a safety net.
export const getDatabaseStatus = unstable_cache(
  async () => {
    const live = await tableExists(LIVE_TABLE);
    return {
      hasDatabase: live,
      rowCount: live ? await countRows(LIVE_TABLE) : 0,
      lastUpdated: await getLastUpdated(),
      hasPrevious: await tableExists(PREVIOUS_TABLE),
    };
  },
  ["database-status"],
  { tags: [CATALOGUE_TAG], revalidate: 300 },
);
