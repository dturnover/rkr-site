import { getClient } from "@/lib/db/client";
import { LIVE_TABLE } from "@/lib/db/ddl";
import { CSV_FIELDS, contentHashOf, type FieldRow } from "./importCsv";

// A rolling history of the last few diff imports, kept as a SAFETY NET: each
// entry stores the exact set of records an upload added and removed (already
// including editor edits, since the diff runs on the overlay-applied target).
// Because a diff is small, storing it is cheap — nothing like snapshotting the
// whole 135k-row catalogue. From these diffs we can reconstruct (and export as
// xlsx) the catalogue as it stood before any of the last N imports, which is
// enough to recover from a bad upload.
//
// Only diffs up to a size cap are stored in full; a giant one (e.g. an accidental
// wholesale replace) records its counts but no payload, so it can't be
// reconstructed *through* — reconstruction stops being offered at that point.
const KEEP = 10;
// Combined inserted+deleted rows we'll store per import. The diff importer uses
// the same cap to decide whether to collect the row payload at all, so a giant
// change never balloons memory or a single stored row.
export const HISTORY_ROW_CAP = 25000;

let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS import_history (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at     TEXT NOT NULL,
          inserted_count INTEGER NOT NULL,
          deleted_count  INTEGER NOT NULL,
          result_count   INTEGER NOT NULL,
          previous_count INTEGER NOT NULL,
          truncated      INTEGER NOT NULL DEFAULT 0,
          payload        TEXT
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export interface ImportHistoryEntry {
  id: number;
  created_at: string;
  inserted_count: number;
  deleted_count: number;
  result_count: number;
  previous_count: number;
  truncated: boolean;
}

// Keep only the fields we hash/store, so a stored payload can't drift from the
// import format.
function slimRow(row: FieldRow): FieldRow {
  const out: FieldRow = {};
  for (const f of CSV_FIELDS) out[f] = row[f] ?? null;
  return out;
}

/** Records one diff import and prunes the history to the most recent KEEP. When
 * the change is bigger than ROW_CAP, the counts are still recorded but the
 * payload is dropped (truncated) so history storage stays bounded. Never throws
 * out to the caller — a history-write failure must not fail the import itself. */
export async function recordImport(entry: {
  insertedCount: number;
  deletedCount: number;
  previousRowCount: number;
  rowCount: number;
  // The actual changed rows, for reconstruction. Omitted by the caller when the
  // change was too large to store — the entry is then recorded as truncated.
  rows?: { inserted: FieldRow[]; deleted: FieldRow[] };
}): Promise<void> {
  try {
    await ensureTable();
    const client = await getClient();
    const truncated = !entry.rows;
    const payload = entry.rows
      ? JSON.stringify({
          inserted: entry.rows.inserted.map(slimRow),
          deleted: entry.rows.deleted.map(slimRow),
        })
      : null;

    await client.execute({
      sql: `INSERT INTO import_history
              (created_at, inserted_count, deleted_count, result_count, previous_count, truncated, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        new Date().toISOString(),
        entry.insertedCount,
        entry.deletedCount,
        entry.rowCount,
        entry.previousRowCount,
        truncated ? 1 : 0,
        payload,
      ],
    });

    // Prune to the most recent KEEP entries.
    await client.execute({
      sql: `DELETE FROM import_history
            WHERE id NOT IN (SELECT id FROM import_history ORDER BY id DESC LIMIT ?)`,
      args: [KEEP],
    });
  } catch (err) {
    console.error("[import-history] failed to record (import itself is unaffected):", err);
  }
}

/** The stored imports, newest first, without payloads — for the admin list. */
export async function listImports(): Promise<ImportHistoryEntry[]> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute(
    `SELECT id, created_at, inserted_count, deleted_count, result_count, previous_count, truncated
     FROM import_history ORDER BY id DESC`
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    created_at: String(r.created_at),
    inserted_count: Number(r.inserted_count),
    deleted_count: Number(r.deleted_count),
    result_count: Number(r.result_count),
    previous_count: Number(r.previous_count),
    truncated: Number(r.truncated) === 1,
  }));
}

interface Payload {
  inserted: FieldRow[];
  deleted: FieldRow[];
}

/** Can we reconstruct the catalogue as it was BEFORE import `id`? Only if every
 * import from `id` up to the newest has a stored (non-truncated) payload — the
 * reconstruction reverses each of them in turn. */
export async function canReconstructBefore(id: number): Promise<boolean> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT truncated FROM import_history WHERE id >= ?`,
    args: [id],
  });
  if (res.rows.length === 0) return false;
  return res.rows.every((r) => Number(r.truncated) === 0);
}

// Reverses the imports from newest down to `fromId`, composing their inverses
// into a net change (rows to REMOVE from the current catalogue, rows to ADD
// back) that turns the live state into the state just before `fromId`. Handles
// churn (a row added by one import and removed by a later one) via cancellation,
// so adjacent add/remove of identical content don't both survive.
async function computeReversal(fromId: number): Promise<{
  remove: Map<string, number>;
  add: Map<string, FieldRow[]>;
}> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT payload FROM import_history WHERE id >= ? AND truncated = 0 ORDER BY id DESC`,
    args: [fromId],
  });

  const remove = new Map<string, number>();
  const add = new Map<string, FieldRow[]>();
  const bump = (m: Map<string, number>, k: string, d: number) => m.set(k, (m.get(k) ?? 0) + d);

  for (const r of res.rows) {
    const payload = JSON.parse(String(r.payload)) as Payload;
    // Reverse this import: its inserted rows should be removed; its deleted
    // rows should be added back.
    for (const row of payload.inserted) {
      const h = contentHashOf(row);
      const pending = add.get(h);
      if (pending && pending.length > 0) pending.pop(); // cancels a queued add
      else bump(remove, h, 1);
    }
    for (const row of payload.deleted) {
      const h = contentHashOf(row);
      if ((remove.get(h) ?? 0) > 0) bump(remove, h, -1); // cancels a queued remove
      else {
        const list = add.get(h) ?? [];
        list.push(row);
        add.set(h, list);
      }
    }
  }
  return { remove, add };
}

/** Streams the catalogue as it stood BEFORE import `fromId`: the current live
 * rows with the reversal applied (skip rows the later imports added, then emit
 * the rows they removed). Low memory — only the (small) reversal is held; the
 * live rows stream past. */
export async function* reconstructBeforeImport(fromId: number): AsyncGenerator<FieldRow> {
  const { remove, add } = await computeReversal(fromId);
  const client = await getClient();
  const cols = CSV_FIELDS.join(", ");

  let after = 0;
  for (;;) {
    const page = await client.execute({
      sql: `SELECT id, ${cols} FROM ${LIVE_TABLE} WHERE id > ? ORDER BY id LIMIT 5000`,
      args: [after],
    });
    if (page.rows.length === 0) break;
    for (const raw of page.rows) {
      const r = raw as unknown as Record<string, string | null> & { id: number };
      after = Number(r.id);
      const row: FieldRow = {};
      for (const f of CSV_FIELDS) row[f] = r[f] ?? null;
      const h = contentHashOf(row);
      const rem = remove.get(h) ?? 0;
      if (rem > 0) {
        remove.set(h, rem - 1); // this current row was added later → omit from the past state
        continue;
      }
      yield row;
    }
  }

  // Rows the later imports removed need to be added back.
  for (const list of add.values()) {
    for (const row of list) yield row;
  }
}
