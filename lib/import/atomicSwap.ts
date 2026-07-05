import { getClient } from "@/lib/db/client";
import {
  LIVE_TABLE,
  LIVE_FTS_TABLE,
  STAGING_TABLE,
  STAGING_FTS_TABLE,
  PREVIOUS_TABLE,
  PREVIOUS_FTS_TABLE,
} from "@/lib/db/ddl";
import { buildStagingTables } from "./importCsv";

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
const STALE_LOCK_MS = 15 * 60 * 1000; // generous upper bound past the slowest observed import

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(): Promise<void> {
  const client = await getClient();
  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${LOCK_TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), locked_at TEXT NOT NULL)`
  );

  const existing = await client.execute(`SELECT locked_at FROM ${LOCK_TABLE} WHERE id = 1`);
  const lockedAt = existing.rows[0]?.locked_at as string | undefined;
  if (lockedAt && Date.now() - new Date(lockedAt).getTime() > STALE_LOCK_MS) {
    // Almost certainly an abandoned lock from a crashed/killed process —
    // clear it rather than block imports forever.
    await client.execute(`DELETE FROM ${LOCK_TABLE} WHERE id = 1`);
  }

  try {
    await client.execute(`INSERT INTO ${LOCK_TABLE} (id, locked_at) VALUES (1, ?)`, [
      new Date().toISOString(),
    ]);
  } catch {
    throw new Error(
      "Another import or restore is already in progress. Wait for it to finish and try again."
    );
  }
}

async function releaseLock(): Promise<void> {
  const client = await getClient();
  await client.execute(`DELETE FROM ${LOCK_TABLE} WHERE id = 1`).catch(() => {});
}

/** Against a remote Turso database, buildStagingTables makes many network
 * round trips (batched, but still many) — a single transient timeout
 * shouldn't fail the whole import (confirmed by testing: this happened for
 * real against a live Turso database). Retrying the whole build is safe
 * because it always drops and fully rebuilds records_new from scratch. */
async function buildStagingTablesWithRetry(
  csvBuffer: Buffer
): Promise<{ rowCount: number }> {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      return await buildStagingTables(csvBuffer);
    } catch (err) {
      if (i === attempts - 1) throw err;
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
async function stampUpdatedNow(): Promise<void> {
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
export async function importAndSwap(csvBuffer: Buffer): Promise<ImportResult> {
  await acquireLock();
  try {
    const { rowCount } = await buildStagingTablesWithRetry(csvBuffer);

    const client = await getClient();
    const liveExists = await tableExists(LIVE_TABLE);
    const previousRowCount = liveExists ? await countRows(LIVE_TABLE) : null;

    const tx = await client.transaction("write");
    try {
      const statements = [
        `DROP TABLE IF EXISTS ${PREVIOUS_FTS_TABLE}`,
        `DROP TABLE IF EXISTS ${PREVIOUS_TABLE}`,
        ...(liveExists
          ? [
              `ALTER TABLE ${LIVE_TABLE} RENAME TO ${PREVIOUS_TABLE}`,
              `ALTER TABLE ${LIVE_FTS_TABLE} RENAME TO ${PREVIOUS_FTS_TABLE}`,
            ]
          : []),
        `ALTER TABLE ${STAGING_TABLE} RENAME TO ${LIVE_TABLE}`,
        `ALTER TABLE ${STAGING_FTS_TABLE} RENAME TO ${LIVE_FTS_TABLE}`,
      ];
      await tx.batch(statements);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    await stampUpdatedNow();

    const lowRowCountWarning =
      previousRowCount != null && rowCount < previousRowCount * 0.5;

    return { rowCount, previousRowCount, lowRowCountWarning };
  } finally {
    await releaseLock();
  }
}

/** Swaps the live tables back with the previous generation. A true 3-way
 * swap (not a drop), so a restore can itself be undone by calling this
 * again — same property the old file-based version had. */
export async function restorePrevious(): Promise<void> {
  await acquireLock();
  try {
    if (!(await tableExists(PREVIOUS_TABLE))) {
      throw new Error("No previous database version to restore.");
    }

    const client = await getClient();
    const tx = await client.transaction("write");
    try {
      await tx.batch([
        `ALTER TABLE ${LIVE_TABLE} RENAME TO records_swap_tmp`,
        `ALTER TABLE ${LIVE_FTS_TABLE} RENAME TO records_swap_tmp_fts`,
        `ALTER TABLE ${PREVIOUS_TABLE} RENAME TO ${LIVE_TABLE}`,
        `ALTER TABLE ${PREVIOUS_FTS_TABLE} RENAME TO ${LIVE_FTS_TABLE}`,
        `ALTER TABLE records_swap_tmp RENAME TO ${PREVIOUS_TABLE}`,
        `ALTER TABLE records_swap_tmp_fts RENAME TO ${PREVIOUS_FTS_TABLE}`,
      ]);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    await stampUpdatedNow();
  } finally {
    await releaseLock();
  }
}

export async function getDatabaseStatus() {
  const live = await tableExists(LIVE_TABLE);
  return {
    hasDatabase: live,
    rowCount: live ? await countRows(LIVE_TABLE) : 0,
    lastUpdated: await getLastUpdated(),
    hasPrevious: await tableExists(PREVIOUS_TABLE),
  };
}
