import { getClient } from "@/lib/db/client";
import { CATALOG_FTS_COLUMNS } from "@/lib/db/ddl";

// The editor overlay: everything editors change lives here, in tables OUTSIDE
// the import-swap set, so it survives every CSV upload and is re-applied on
// top of dad's refreshed base data (Phase 3).
//
//  - editor_field_edits : per-field overrides on EXISTING (base) records.
//  - editor_records     : brand-new records editors added (not in dad's file).
//  - modification_log   : an audit trail of every change (who/what/when).
//
// A record is identified by a content-derived KEY (matrix number first, then
// label number + artist + title) rather than its row id, because ids are
// reassigned on every import — the key is what lets an edit re-attach to the
// same song after dad re-uploads. See computeRecordKey below.

let ensured: Promise<void> | null = null;

function ensureOverlayTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.executeMultiple(`
        CREATE TABLE IF NOT EXISTS editor_field_edits (
          record_key  TEXT NOT NULL,
          field       TEXT NOT NULL,
          value       TEXT,
          editor_id   INTEGER,
          editor_name TEXT,
          updated_at  TEXT NOT NULL,
          PRIMARY KEY (record_key, field)
        );
        CREATE TABLE IF NOT EXISTS editor_records (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          record_key  TEXT NOT NULL UNIQUE,
          data        TEXT NOT NULL,
          editor_id   INTEGER,
          editor_name TEXT,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS modification_log (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          record_key  TEXT,
          record_id   INTEGER,
          action      TEXT NOT NULL,
          field       TEXT,
          old_value   TEXT,
          new_value   TEXT,
          editor_id   INTEGER,
          editor_name TEXT,
          created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_modlog_key ON modification_log(record_key);
        CREATE INDEX IF NOT EXISTS idx_modlog_created ON modification_log(created_at);
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

// Every field an editor may change (mirrors the records columns, minus the
// derived id / _norm / year_sort columns, which this module recomputes).
export const EDITABLE_FIELDS = [
  "artist", "artist_credit", "title", "title_credit",
  "matrix_number", "label_number", "label", "country", "format",
  "producer", "year", "riddim", "version", "genre", "notes",
  "song_origin", "additions",
  "b_side_artist", "b_side_artist_credit", "b_side_title",
  "b_side_title_credit", "b_side_matrix_number", "b_side_label_number",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

// _norm columns are kept in sync with their source field so browse/sort/search
// keep working after an edit (same derivation the importer uses).
const NORM_MAP: Partial<Record<EditableField, string>> = {
  artist: "artist_norm", label: "label_norm", producer: "producer_norm",
  riddim: "riddim_norm", country: "country_norm", song_origin: "origin_norm",
  genre: "genre_norm", format: "format_norm",
};

// The trigram catalog index is uniformly lowercase — same expressions the
// importer uses (see lib/import/importCsv.ts).
const CATALOG_FTS_SOURCE: Record<string, string> = {
  artist: "artist_norm", title: "lower(title)", label: "label_norm",
  label_number: "lower(label_number)", matrix_number: "lower(matrix_number)",
  producer: "producer_norm", country: "country_norm", format: "format_norm",
  year: "lower(year)", genre: "genre_norm", riddim: "riddim_norm",
  origin: "origin_norm", notes: "lower(notes)",
};

function nullIfBlank(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function deriveYearSort(year: string | null): number | null {
  if (!year) return null;
  const m = year.match(/(\d{4})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n < 1850 || n > 2100 ? null : n;
}

function normKey(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Content-derived identity: matrix number if present, else label number +
 * artist + title. Stable across imports (unlike the row id), so an edit
 * re-attaches to the same song after dad re-uploads. */
export function computeRecordKey(r: {
  matrix_number?: string | null;
  label_number?: string | null;
  artist?: string | null;
  title?: string | null;
}): string {
  const mx = normKey(r.matrix_number);
  if (mx) return `mx:${mx}`;
  return `lk:${normKey(r.label_number)}|${normKey(r.artist)}|${normKey(r.title)}`;
}

// SQL fragments to refresh both FTS tables for a single record id.
const CATALOG_EXPRS = CATALOG_FTS_COLUMNS.map((c) => CATALOG_FTS_SOURCE[c]).join(", ");
function ftsRefreshStatements(id: number) {
  return [
    { sql: `DELETE FROM records_fts WHERE rowid = ?`, args: [id] },
    {
      sql: `INSERT INTO records_fts(rowid, title, title_credit, artist, artist_credit, notes)
            SELECT id, title, title_credit, artist, artist_credit, notes FROM records WHERE id = ?`,
      args: [id],
    },
    { sql: `DELETE FROM records_catalog_fts WHERE rowid = ?`, args: [id] },
    {
      sql: `INSERT INTO records_catalog_fts(rowid, ${CATALOG_FTS_COLUMNS.join(", ")})
            SELECT id, ${CATALOG_EXPRS} FROM records WHERE id = ?`,
      args: [id],
    },
  ];
}

export interface EditorInfo {
  uid: number | "env-admin";
  name: string;
}

function editorIdArg(uid: number | "env-admin"): number | null {
  return typeof uid === "number" ? uid : null;
}

/** Applies an editor's field changes to an existing record: updates the live
 * `records` row (so it's visible immediately), records the override in the
 * overlay so it survives re-import, refreshes the search index, and logs each
 * change. Returns the number of fields actually changed. */
export async function applyFieldEdits(
  recordId: number,
  incoming: Partial<Record<EditableField, string | null>>,
  editor: EditorInfo
): Promise<number> {
  await ensureOverlayTables();
  const client = await getClient();

  const cur = await client.execute({
    sql: `SELECT ${EDITABLE_FIELDS.join(", ")} FROM records WHERE id = ? LIMIT 1`,
    args: [recordId],
  });
  const current = cur.rows[0] as unknown as Record<EditableField, string | null> | undefined;
  if (!current) return 0;

  const key = computeRecordKey(current);
  const isEditorRecord =
    (await client.execute({ sql: `SELECT 1 FROM editor_records WHERE record_key = ? LIMIT 1`, args: [key] }))
      .rows.length > 0;

  const changes: { field: EditableField; oldValue: string | null; newValue: string | null }[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (!(field in incoming)) continue;
    const newValue = nullIfBlank(incoming[field] ?? null);
    const oldValue = nullIfBlank(current[field]);
    if (newValue !== oldValue) changes.push({ field, oldValue, newValue });
  }
  if (changes.length === 0) return 0;

  const now = new Date().toISOString();
  const statements: { sql: string; args: (string | number | null)[] }[] = [];

  for (const { field, oldValue, newValue } of changes) {
    // Update the field + any derived columns on the live record.
    const setPairs: [string, string | number | null][] = [[field, newValue]];
    if (NORM_MAP[field]) setPairs.push([NORM_MAP[field]!, newValue ? newValue.toLowerCase() : null]);
    if (field === "year") setPairs.push(["year_sort", deriveYearSort(newValue)]);
    statements.push({
      sql: `UPDATE records SET ${setPairs.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`,
      args: [...setPairs.map(([, v]) => v), recordId],
    });

    // Persist the override in the overlay (only for BASE records — an
    // editor-added record carries its own full state in editor_records,
    // refreshed below).
    if (!isEditorRecord) {
      statements.push({
        sql: `INSERT INTO editor_field_edits (record_key, field, value, editor_id, editor_name, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(record_key, field) DO UPDATE SET
                value = excluded.value, editor_id = excluded.editor_id,
                editor_name = excluded.editor_name, updated_at = excluded.updated_at`,
        args: [key, field, newValue, editorIdArg(editor.uid), editor.name, now],
      });
    }

    statements.push({
      sql: `INSERT INTO modification_log
              (record_key, record_id, action, field, old_value, new_value, editor_id, editor_name, created_at)
            VALUES (?, ?, 'modified', ?, ?, ?, ?, ?, ?)`,
      args: [key, recordId, field, oldValue, newValue, editorIdArg(editor.uid), editor.name, now],
    });
  }

  statements.push(...ftsRefreshStatements(recordId));

  // If this is an editor-added record, refresh its stored full state so the
  // overlay re-materializes the latest version on the next import.
  if (isEditorRecord) {
    const merged: Record<string, string | null> = { ...current };
    for (const { field, newValue } of changes) merged[field] = newValue;
    statements.push({
      sql: `UPDATE editor_records SET data = ?, editor_id = ?, editor_name = ?, updated_at = ? WHERE record_key = ?`,
      args: [JSON.stringify(merged), editorIdArg(editor.uid), editor.name, now, key],
    });
  }

  await client.batch(statements, "write");
  return changes.length;
}

/** Creates a brand-new record (not in dad's file). Inserts it live, stores it
 * in editor_records so it survives re-import, indexes it, and logs it.
 * Returns the new record id. */
export async function createRecord(
  incoming: Partial<Record<EditableField, string | null>>,
  editor: EditorInfo
): Promise<number> {
  await ensureOverlayTables();
  const client = await getClient();

  const fields: Record<string, string | null> = {};
  for (const f of EDITABLE_FIELDS) fields[f] = nullIfBlank(incoming[f] ?? null);

  const key = computeRecordKey(fields);

  // Explicit id = max+1 rather than relying on AUTOINCREMENT, which can behave
  // unexpectedly right after the import swap reseeds the table.
  const maxRes = await client.execute(`SELECT COALESCE(MAX(id), 0) AS m FROM records`);
  const newId = Number(maxRes.rows[0]?.m ?? 0) + 1;

  const cols = [...EDITABLE_FIELDS] as string[];
  const vals: (string | number | null)[] = EDITABLE_FIELDS.map((f) => fields[f]);
  // Derived columns.
  cols.push("year_sort");
  vals.push(deriveYearSort(fields.year));
  for (const [src, norm] of Object.entries(NORM_MAP)) {
    cols.push(norm as string);
    vals.push(fields[src] ? (fields[src] as string).toLowerCase() : null);
  }

  const now = new Date().toISOString();
  const statements: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: `INSERT INTO records (id, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`,
      args: [newId, ...vals],
    },
    ...ftsRefreshStatements(newId),
    {
      sql: `INSERT INTO editor_records (record_key, data, editor_id, editor_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(record_key) DO UPDATE SET
              data = excluded.data, updated_at = excluded.updated_at`,
      args: [key, JSON.stringify(fields), editorIdArg(editor.uid), editor.name, now, now],
    },
    {
      sql: `INSERT INTO modification_log
              (record_key, record_id, action, field, old_value, new_value, editor_id, editor_name, created_at)
            VALUES (?, ?, 'new', NULL, NULL, ?, ?, ?, ?)`,
      args: [key, newId, fields.title, editorIdArg(editor.uid), editor.name, now],
    },
  ];

  await client.batch(statements, "write");
  return newId;
}

export interface LogEntry {
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  editor_name: string | null;
  created_at: string;
}

/** The change history for one record (newest first), for the per-record log. */
export async function getRecordLog(recordKey: string, limit = 50): Promise<LogEntry[]> {
  await ensureOverlayTables();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT action, field, old_value, new_value, editor_name, created_at
          FROM modification_log WHERE record_key = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    args: [recordKey, limit],
  });
  return res.rows as unknown as LogEntry[];
}

export interface GlobalLogEntry extends LogEntry {
  record_id: number | null;
}

/** The global modification log (newest first), paginated. */
export async function getGlobalLog(page: number, pageSize = 50): Promise<{ entries: GlobalLogEntry[]; total: number }> {
  await ensureOverlayTables();
  const client = await getClient();
  const totalRes = await client.execute(`SELECT COUNT(*) AS c FROM modification_log`);
  const total = Number(totalRes.rows[0]?.c ?? 0);
  const res = await client.execute({
    sql: `SELECT record_id, action, field, old_value, new_value, editor_name, created_at
          FROM modification_log ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    args: [pageSize, (page - 1) * pageSize],
  });
  return { entries: res.rows as unknown as GlobalLogEntry[], total };
}
