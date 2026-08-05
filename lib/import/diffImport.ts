import { getClient } from "@/lib/db/client";
import {
  CATALOG_FTS_COLUMNS,
  LIVE_TABLE,
  LIVE_FTS_TABLE,
  LIVE_CATALOG_FTS_TABLE,
  PREVIOUS_TABLE,
  PREVIOUS_FTS_TABLE,
  PREVIOUS_CATALOG_FTS_TABLE,
} from "@/lib/db/ddl";
import { acquireLock, releaseLock, startLockHeartbeat, stampUpdatedNow } from "./atomicSwap";
import { recordImport, HISTORY_ROW_CAP } from "./importHistory";
import {
  CSV_FIELDS,
  FTS_COLUMNS,
  RECORD_INSERT_COLUMNS,
  CATALOG_FTS_SOURCE_EXPR,
  contentHashOf,
  recordInsertValues,
  streamTargetRows,
  type ProgressFn,
  type FieldRow,
} from "./importCsv";

// Incremental ("diff") import. Instead of rebuilding all 135k rows on every
// upload — which cannot finish within the serverless time limit against Turso's
// ~200 writes/sec — this writes ONLY what actually changed:
//   • a record in the upload that isn't in the live catalogue  → INSERT
//   • a record in the live catalogue that isn't in the upload  → DELETE
//   • a record whose every field matches                        → left untouched
// A changed record shows up as (its old version DELETEd + new version INSERTed).
// So a normal monthly update touches a few hundred/thousand rows and finishes
// in seconds. Records are compared by a content fingerprint of all 24 catalogue
// fields (contentHashOf), which both sides compute identically — no dependence
// on row ids, which the old full rebuild reassigned every time.
//
// RESUMABLE: changes are applied in committed batches with a per-pass time
// budget. If a single upload has more differences than fit in one function
// invocation (notably the FIRST import after this system ships, when the live
// baseline is stale and lots differs), the pass stops and reports complete=false;
// the caller simply calls again and, because each pass re-fingerprints the now
// partially-updated catalogue, the remaining difference shrinks every time until
// it converges. Steady-state monthly updates are tiny and finish in one pass.
// Each batch indexes its own rows in both FTS tables, so an interrupted pass
// never leaves committed rows unsearchable.

// Turso write cost is dominated by per-round-trip latency, not row count, so
// pack each round trip as full as SQLite's bind-variable limit (32766) safely
// allows: 800 rows × ~34 columns ≈ 27k binds, comfortably under the cap, and
// far fewer round trips than small chunks. Reads are cheaper, so page them big
// too, to cut the number of fingerprint round trips.
// Deletes carry only row ids, so pack many more per round trip than inserts
// (which carry ~34 columns each). Fewer round trips ≈ less wall-clock, since
// Turso write cost is latency-dominated.
const DELETE_CHUNK = 4000; // ids per DELETE ... WHERE id IN (...) statement
const INSERT_CHUNK = 800; // rows per multi-row INSERT statement
const READ_PAGE = 20000; // rows per page when fingerprinting the live catalogue

export interface DiffResult {
  inserted: number;
  deleted: number;
  unchanged: number;
  previousRowCount: number;
  rowCount: number;
  lowRowCountWarning: boolean;
  // False when this pass ran out of time before applying every change — the
  // caller should call importDiff again to continue (see the resumable design
  // note above). A normal small update always completes in one pass.
  complete: boolean;
}

// How long a single pass will spend before stopping to let the caller resume.
// Comfortably under the 300s function limit so the pass returns (releasing the
// import lock) instead of being killed mid-write.
const APPLY_BUDGET_MS = 210_000;

/** True when the live `records` table exists and holds at least one row — the
 * precondition for a diff. A fresh/empty database has nothing to diff against,
 * so the caller does a full build for that first load instead. */
export async function canDiff(): Promise<boolean> {
  const client = await getClient();
  try {
    const res = await client.execute(`SELECT 1 FROM ${LIVE_TABLE} LIMIT 1`);
    return res.rows.length > 0;
  } catch {
    return false; // table doesn't exist yet
  }
}

export async function importDiff(
  csvBuffer: Buffer,
  onProgress?: ProgressFn,
  opts: { budgetMs?: number; resume?: boolean } = {}
): Promise<DiffResult> {
  // Serialize against any other import/restore. A pass keeps the lock fresh
  // with a heartbeat; a resume pass waits (up to 2 min) for a stale lock left
  // by a killed prior pass to expire, then takes over. So consecutive passes
  // hand off cleanly whether the previous one returned or was killed.
  await acquireLock({ maxWaitMs: 120_000, onWait: (m) => onProgress?.(m) });
  const stopHeartbeat = startLockHeartbeat();
  try {
    return await runDiff(csvBuffer, onProgress, opts.budgetMs ?? APPLY_BUDGET_MS, opts.resume ?? false);
  } finally {
    stopHeartbeat();
    await releaseLock();
  }
}

async function runDiff(
  csvBuffer: Buffer,
  onProgress: ProgressFn | undefined,
  budgetMs: number,
  isResume: boolean
): Promise<DiffResult> {
  const client = await getClient();
  const t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
  // Guarantee forward progress: never defer until at least one batch has been
  // committed this pass, so even a pass whose read phase ate the whole budget
  // still applies something (otherwise a resume loop could spin forever).
  let appliedBatches = 0;
  const overBudget = () => appliedBatches > 0 && Date.now() - t0 >= budgetMs;

  // 1) Fingerprint the current live catalogue: content hash → queue of row ids
  //    holding that content (a multiset, so duplicate rows are handled). Read in
  //    pages by id so only the compact hash+id map is kept in memory.
  onProgress?.("Comparing your file to the current catalogue…");
  const selectCols = CSV_FIELDS.join(", ");
  const dbHashes = new Map<string, number[]>();
  let previousRowCount = 0;
  let maxId = 0;
  let after = 0;
  for (;;) {
    const page = await client.execute({
      sql: `SELECT id, ${selectCols} FROM ${LIVE_TABLE} WHERE id > ? ORDER BY id LIMIT ?`,
      args: [after, READ_PAGE],
    });
    if (page.rows.length === 0) break;
    for (const r of page.rows) {
      const row = r as unknown as Record<string, string | null> & { id: number };
      const id = Number(row.id);
      if (id > maxId) maxId = id;
      const hash = contentHashOf(row);
      const bucket = dbHashes.get(hash);
      if (bucket) bucket.push(id);
      else dbHashes.set(hash, [id]);
      previousRowCount++;
      after = id;
    }
    onProgress?.(`Read ${previousRowCount.toLocaleString()} existing records (${secs()}s)…`);
  }

  // 2) Stream the upload's target rows (file + editor overlay). A hash hit means
  //    "unchanged" (consume one id so it isn't later treated as removed); a miss
  //    means new/changed → insert. New rows get ids continuing after the current
  //    max. Inserts are applied in committed batches (NOT one big transaction)
  //    so progress survives across resumable passes; each batch also indexes its
  //    own rows in both FTS tables, so a batch is never left un-searchable.
  const catalogExprs = CATALOG_FTS_COLUMNS.map((c) => CATALOG_FTS_SOURCE_EXPR[c]);
  const insertColsSql = `INSERT INTO ${LIVE_TABLE} (id, ${RECORD_INSERT_COLUMNS.join(", ")}) VALUES `;
  const rowPlaceholder = `(?, ${RECORD_INSERT_COLUMNS.map(() => "?").join(", ")})`;

  let newId = maxId;
  let inserted = 0;
  let unchanged = 0;
  let deferredInserts = false;
  let nextReport = 5000;

  // Collect the changed rows for the reconstructable history — but only on a
  // single-pass import (not a resume), and only up to the storage cap. A
  // multi-pass "catch-up" import records no history entry (its net change spans
  // passes and isn't a meaningful restore point).
  const captureHistory = !isResume;
  const insertedRows: FieldRow[] = [];
  let historyOverflow = false;

  let insArgs: (string | number | null)[] = [];
  let insCount = 0;
  let batchFirstId = 0;
  const flushInserts = async () => {
    if (insCount === 0) return;
    const lastId = newId;
    await client.batch(
      [
        { sql: insertColsSql + Array(insCount).fill(rowPlaceholder).join(", "), args: insArgs },
        {
          sql: `INSERT INTO ${LIVE_FTS_TABLE} (rowid, ${FTS_COLUMNS.join(", ")})
                SELECT id, ${FTS_COLUMNS.join(", ")} FROM ${LIVE_TABLE} WHERE id BETWEEN ? AND ?`,
          args: [batchFirstId, lastId],
        },
        {
          sql: `INSERT INTO ${LIVE_CATALOG_FTS_TABLE} (rowid, ${CATALOG_FTS_COLUMNS.join(", ")})
                SELECT id, ${catalogExprs.join(", ")} FROM ${LIVE_TABLE} WHERE id BETWEEN ? AND ?`,
          args: [batchFirstId, lastId],
        },
      ],
      "write"
    );
    insArgs = [];
    insCount = 0;
    appliedBatches++;
    await new Promise((resolve) => setImmediate(resolve));
  };

  for await (const row of streamTargetRows(csvBuffer, onProgress)) {
    const hash = contentHashOf(row);
    const bucket = dbHashes.get(hash);
    if (bucket && bucket.length > 0) {
      bucket.pop(); // matched an existing row → unchanged, keep it
      unchanged++;
      continue;
    }
    // New/changed row. Apply it only while within the time budget; otherwise
    // leave it for the next pass (it stays "new" until inserted).
    if (overBudget()) {
      deferredInserts = true;
      continue;
    }
    newId++;
    if (insCount === 0) batchFirstId = newId;
    insArgs.push(newId, ...recordInsertValues(row));
    insCount++;
    inserted++;
    if (captureHistory) {
      if (insertedRows.length < HISTORY_ROW_CAP) insertedRows.push(row);
      else historyOverflow = true;
    }
    if (insCount >= INSERT_CHUNK) await flushInserts();
    if (inserted + unchanged >= nextReport) {
      onProgress?.(
        `Checked ${(inserted + unchanged).toLocaleString()} records; ${inserted.toLocaleString()} new so far (${secs()}s)…`
      );
      nextReport += 5000;
    }
  }
  await flushInserts();

  // 3) Whatever ids are left in the fingerprint map were in the live catalogue
  //    but not in the upload → deletes. Apply them (with FTS) in committed id
  //    chunks, also honouring the time budget.
  const deleteIds: number[] = [];
  for (const bucket of dbHashes.values()) for (const id of bucket) deleteIds.push(id);

  let deleted = 0;
  let deferredDeletes = false;
  const deletedRows: FieldRow[] = [];
  onProgress?.(
    `${inserted.toLocaleString()} new/changed applied, ${deleteIds.length.toLocaleString()} to remove (${secs()}s)…`
  );
  for (let i = 0; i < deleteIds.length; i += DELETE_CHUNK) {
    if (overBudget()) {
      deferredDeletes = true;
      break;
    }
    const chunk = deleteIds.slice(i, i + DELETE_CHUNK);
    const inList = chunk.map(() => "?").join(", ");

    // For history, read the rows' content before removing them (bounded by cap).
    if (captureHistory && !historyOverflow) {
      if (inserted + deletedRows.length + chunk.length > HISTORY_ROW_CAP) {
        historyOverflow = true;
      } else {
        const res = await client.execute({
          sql: `SELECT ${selectCols} FROM ${LIVE_TABLE} WHERE id IN (${inList})`,
          args: chunk,
        });
        for (const raw of res.rows) {
          const rr = raw as unknown as Record<string, string | null>;
          const row: FieldRow = {};
          for (const f of CSV_FIELDS) row[f] = rr[f] ?? null;
          deletedRows.push(row);
        }
      }
    }

    await client.batch(
      [
        { sql: `DELETE FROM ${LIVE_TABLE} WHERE id IN (${inList})`, args: chunk },
        { sql: `DELETE FROM ${LIVE_FTS_TABLE} WHERE rowid IN (${inList})`, args: chunk },
        { sql: `DELETE FROM ${LIVE_CATALOG_FTS_TABLE} WHERE rowid IN (${inList})`, args: chunk },
      ],
      "write"
    );
    deleted += chunk.length;
    appliedBatches++;
    await new Promise((resolve) => setImmediate(resolve));
  }

  await stampUpdatedNow();

  const complete = !deferredInserts && !deferredDeletes;
  const rowCount = Number(
    (await client.execute(`SELECT COUNT(*) AS c FROM ${LIVE_TABLE}`)).rows[0]?.c ?? 0
  );

  if (complete) {
    // The atomic-swap "previous version" no longer reflects reality once we edit
    // the live table in place, so drop it (hides the misleading Restore button).
    await client.execute(`DROP TABLE IF EXISTS ${PREVIOUS_FTS_TABLE}`);
    await client.execute(`DROP TABLE IF EXISTS ${PREVIOUS_CATALOG_FTS_TABLE}`);
    await client.execute(`DROP TABLE IF EXISTS ${PREVIOUS_TABLE}`);

    // Record this single-pass import in the rolling history (best-effort).
    if (captureHistory && (inserted > 0 || deleted > 0)) {
      await recordImport({
        insertedCount: inserted,
        deletedCount: deleted,
        previousRowCount,
        rowCount,
        rows: historyOverflow ? undefined : { inserted: insertedRows, deleted: deletedRows },
      });
    }
    onProgress?.(`Done — the catalogue now has ${rowCount.toLocaleString()} records (${secs()}s).`);
  } else {
    onProgress?.(
      `Time budget reached after ${secs()}s — ${inserted.toLocaleString()} added, ${deleted.toLocaleString()} removed so far. Continuing automatically…`
    );
  }

  return {
    inserted,
    deleted,
    unchanged,
    previousRowCount,
    rowCount,
    // Only meaningful once the whole diff has been applied.
    lowRowCountWarning: complete && previousRowCount > 0 && rowCount < previousRowCount * 0.5,
    complete,
  };
}

// Keep FieldRow importable via this module's type surface for callers.
export type { FieldRow };
