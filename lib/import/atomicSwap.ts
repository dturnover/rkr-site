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
// Two of these running concurrently (a double-click, two admin tabs, etc.)
// would race on the same staging/previous table names. Only one may run at
// a time. (This also protects buildStagingTables, which drops and
// recreates records_new before writing to it.)
let operationInProgress = false;

function acquireLock() {
  if (operationInProgress) {
    throw new Error(
      "Another import or restore is already in progress. Wait for it to finish and try again."
    );
  }
  operationInProgress = true;
}

function releaseLock() {
  operationInProgress = false;
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
  acquireLock();
  try {
    const { rowCount } = await buildStagingTables(csvBuffer);

    const client = await getClient();
    const liveExists = await tableExists(LIVE_TABLE);
    const previousRowCount = liveExists ? await countRows(LIVE_TABLE) : null;

    const tx = await client.transaction("write");
    try {
      await tx.execute(`DROP TABLE IF EXISTS ${PREVIOUS_FTS_TABLE}`);
      await tx.execute(`DROP TABLE IF EXISTS ${PREVIOUS_TABLE}`);
      if (liveExists) {
        await tx.execute(`ALTER TABLE ${LIVE_TABLE} RENAME TO ${PREVIOUS_TABLE}`);
        await tx.execute(`ALTER TABLE ${LIVE_FTS_TABLE} RENAME TO ${PREVIOUS_FTS_TABLE}`);
      }
      await tx.execute(`ALTER TABLE ${STAGING_TABLE} RENAME TO ${LIVE_TABLE}`);
      await tx.execute(`ALTER TABLE ${STAGING_FTS_TABLE} RENAME TO ${LIVE_FTS_TABLE}`);
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
    releaseLock();
  }
}

/** Swaps the live tables back with the previous generation. A true 3-way
 * swap (not a drop), so a restore can itself be undone by calling this
 * again — same property the old file-based version had. */
export async function restorePrevious(): Promise<void> {
  acquireLock();
  try {
    if (!(await tableExists(PREVIOUS_TABLE))) {
      throw new Error("No previous database version to restore.");
    }

    const client = await getClient();
    const tx = await client.transaction("write");
    try {
      await tx.execute(`ALTER TABLE ${LIVE_TABLE} RENAME TO records_swap_tmp`);
      await tx.execute(`ALTER TABLE ${LIVE_FTS_TABLE} RENAME TO records_swap_tmp_fts`);
      await tx.execute(`ALTER TABLE ${PREVIOUS_TABLE} RENAME TO ${LIVE_TABLE}`);
      await tx.execute(`ALTER TABLE ${PREVIOUS_FTS_TABLE} RENAME TO ${LIVE_FTS_TABLE}`);
      await tx.execute(`ALTER TABLE records_swap_tmp RENAME TO ${PREVIOUS_TABLE}`);
      await tx.execute(`ALTER TABLE records_swap_tmp_fts RENAME TO ${PREVIOUS_FTS_TABLE}`);
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    await stampUpdatedNow();
  } finally {
    releaseLock();
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
