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
import { acquireLock, releaseLock, stampUpdatedNow } from "./atomicSwap";
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
// The whole diff is applied in ONE transaction, so the live catalogue either
// updates completely or not at all — a failure never leaves it half-changed.

const DELETE_CHUNK = 400; // ids per DELETE ... WHERE id IN (...) statement
const INSERT_CHUNK = 400; // rows per multi-row INSERT statement
const READ_PAGE = 5000; // rows per page when fingerprinting the live catalogue

export interface DiffResult {
  inserted: number;
  deleted: number;
  unchanged: number;
  previousRowCount: number;
  rowCount: number;
  lowRowCountWarning: boolean;
}

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

export async function importDiff(csvBuffer: Buffer, onProgress?: ProgressFn): Promise<DiffResult> {
  // Serialize against any other import/restore (same lock the full rebuild
  // uses) so two uploads can't interleave their writes on the live table.
  await acquireLock();
  try {
    return await runDiff(csvBuffer, onProgress);
  } finally {
    await releaseLock();
  }
}

async function runDiff(csvBuffer: Buffer, onProgress?: ProgressFn): Promise<DiffResult> {
  const client = await getClient();
  const t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);

  // 1) Fingerprint the current live catalogue: content hash → queue of row ids
  //    holding that content (a multiset, so duplicate rows are handled). Read in
  //    pages by id so we never pull the whole table into memory at once; only
  //    the compact hash+id map is kept.
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

  // 2) Stream the upload's target rows (file + editor overlay). Match each
  //    against the live fingerprints: a hit means "unchanged" (consume one id so
  //    it isn't later treated as removed); a miss means it's new/changed and
  //    must be inserted. New rows get ids continuing after the current max, so
  //    they're contiguous — which lets the FTS backfill select them by range.
  const tx = await client.transaction("write");
  try {
    const newIdStart = maxId + 1;
    let newId = maxId;
    let inserted = 0;
    let unchanged = 0;
    let nextReport = 5000;

    // Collect the inserted rows (up to the history cap) so this import can be
    // stored in the reconstructable history. Past the cap we stop collecting
    // and the entry is recorded as truncated — bounding memory and storage.
    const insertedRows: FieldRow[] = [];
    let historyOverflow = false;

    const insertColsSql = `INSERT INTO ${LIVE_TABLE} (id, ${RECORD_INSERT_COLUMNS.join(", ")}) VALUES `;
    const rowPlaceholder = `(?, ${RECORD_INSERT_COLUMNS.map(() => "?").join(", ")})`;
    let insArgs: (string | number | null)[] = [];
    let insCount = 0;
    const flushInserts = async () => {
      if (insCount === 0) return;
      await tx.execute({
        sql: insertColsSql + Array(insCount).fill(rowPlaceholder).join(", "),
        args: insArgs,
      });
      insArgs = [];
      insCount = 0;
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
      newId++;
      insArgs.push(newId, ...recordInsertValues(row));
      insCount++;
      inserted++;
      if (insertedRows.length < HISTORY_ROW_CAP) insertedRows.push(row);
      else historyOverflow = true;
      if (insCount >= INSERT_CHUNK) await flushInserts();
      if (inserted + unchanged >= nextReport) {
        onProgress?.(`Checked ${(inserted + unchanged).toLocaleString()} records; ${inserted.toLocaleString()} new so far (${secs()}s)…`);
        nextReport += 5000;
      }
    }
    await flushInserts();

    // 3) Whatever ids are left in the fingerprint map were in the live catalogue
    //    but not in the upload → deletes.
    const deleteIds: number[] = [];
    for (const bucket of dbHashes.values()) for (const id of bucket) deleteIds.push(id);

    onProgress?.(
      `${inserted.toLocaleString()} new/changed, ${deleteIds.length.toLocaleString()} removed, ${unchanged.toLocaleString()} unchanged (${secs()}s). Applying…`
    );

    // Capture the full content of the rows we're about to delete (for the
    // reconstructable history) BEFORE they're gone — but only while we're still
    // within the storage cap. Read through the transaction so it sees the
    // pre-delete state.
    const deletedRows: FieldRow[] = [];
    const willStoreHistory =
      !historyOverflow && inserted + deleteIds.length <= HISTORY_ROW_CAP;
    if (willStoreHistory && deleteIds.length > 0) {
      const cols = CSV_FIELDS.join(", ");
      for (let i = 0; i < deleteIds.length; i += READ_PAGE) {
        const chunk = deleteIds.slice(i, i + READ_PAGE);
        const inList = chunk.map(() => "?").join(", ");
        const res = await tx.execute({
          sql: `SELECT ${cols} FROM ${LIVE_TABLE} WHERE id IN (${inList})`,
          args: chunk,
        });
        for (const raw of res.rows) {
          const r = raw as unknown as Record<string, string | null>;
          const row: FieldRow = {};
          for (const f of CSV_FIELDS) row[f] = r[f] ?? null;
          deletedRows.push(row);
        }
      }
    }

    // Apply deletes to the base table and both FTS indexes, in id chunks.
    for (let i = 0; i < deleteIds.length; i += DELETE_CHUNK) {
      const chunk = deleteIds.slice(i, i + DELETE_CHUNK);
      const inList = chunk.map(() => "?").join(", ");
      await tx.batch([
        { sql: `DELETE FROM ${LIVE_TABLE} WHERE id IN (${inList})`, args: chunk },
        { sql: `DELETE FROM ${LIVE_FTS_TABLE} WHERE rowid IN (${inList})`, args: chunk },
        { sql: `DELETE FROM ${LIVE_CATALOG_FTS_TABLE} WHERE rowid IN (${inList})`, args: chunk },
      ]);
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Backfill the FTS indexes for the newly-inserted rows (contiguous id
    // range) with a server-side INSERT...SELECT — the same expressions the full
    // rebuild uses, so the indexes are byte-identical either way.
    if (inserted > 0) {
      await tx.execute({
        sql: `INSERT INTO ${LIVE_FTS_TABLE} (rowid, ${FTS_COLUMNS.join(", ")})
              SELECT id, ${FTS_COLUMNS.join(", ")} FROM ${LIVE_TABLE} WHERE id >= ?`,
        args: [newIdStart],
      });
      const catalogExprs = CATALOG_FTS_COLUMNS.map((c) => CATALOG_FTS_SOURCE_EXPR[c]);
      await tx.execute({
        sql: `INSERT INTO ${LIVE_CATALOG_FTS_TABLE} (rowid, ${CATALOG_FTS_COLUMNS.join(", ")})
              SELECT id, ${catalogExprs.join(", ")} FROM ${LIVE_TABLE} WHERE id >= ?`,
        args: [newIdStart],
      });
    }

    await tx.commit();
    await stampUpdatedNow();

    // The atomic-swap "previous version" snapshot is only meaningful right after
    // a full rebuild; once we start editing the live table in place it no longer
    // reflects the pre-import state, so drop it rather than leave the "Restore
    // Previous" button silently reverting to a stale baseline. (A proper
    // per-diff undo can replace this later.) Safety here rests on the diff being
    // atomic, the low-row-count warning below, and re-uploading a good file.
    await client.execute(`DROP TABLE IF EXISTS ${PREVIOUS_FTS_TABLE}`);
    await client.execute(`DROP TABLE IF EXISTS ${PREVIOUS_CATALOG_FTS_TABLE}`);
    await client.execute(`DROP TABLE IF EXISTS ${PREVIOUS_TABLE}`);

    const rowCount = previousRowCount + inserted - deleteIds.length;

    // Record this import in the rolling history (best-effort; never fails the
    // import). Only store the row payload when the change fit under the cap, so
    // history stays small and reconstructable.
    if (inserted > 0 || deleteIds.length > 0) {
      await recordImport({
        insertedCount: inserted,
        deletedCount: deleteIds.length,
        previousRowCount,
        rowCount,
        rows: willStoreHistory ? { inserted: insertedRows, deleted: deletedRows } : undefined,
      });
    }

    onProgress?.(`Done — the catalogue now has ${rowCount.toLocaleString()} records (${secs()}s).`);
    return {
      inserted,
      deleted: deleteIds.length,
      unchanged,
      previousRowCount,
      rowCount,
      // Warn if the upload would wipe out more than half the catalogue — the
      // same guard the full rebuild has, in case a truncated/wrong file is
      // uploaded by mistake.
      lowRowCountWarning: previousRowCount > 0 && rowCount < previousRowCount * 0.5,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// Keep FieldRow importable via this module's type surface for callers.
export type { FieldRow };
