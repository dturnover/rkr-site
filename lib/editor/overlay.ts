import { getClient } from "@/lib/db/client";
import { CATALOG_FTS_COLUMNS } from "@/lib/db/ddl";
import { PAGE_SIZE } from "@/lib/queries/shared";

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

/** SQL mirror of normKey() below, for the one-off backfill of record_key on a
 * catalogue imported before that column existed. Lower-cases, turns tabs and
 * newlines into spaces, collapses runs of spaces, and trims. The nested
 * replaces collapse runs of up to 16 spaces, well past anything the catalogue
 * actually contains; a row whose value somehow exceeds that just keeps a key
 * the next upload will correct, since the importer recomputes it properly. */
function sqlNormKey(column: string): string {
  let expr = `lower(coalesce(${column}, ''))`;
  for (const ch of ["char(9)", "char(10)", "char(13)"]) expr = `replace(${expr}, ${ch}, ' ')`;
  for (let i = 0; i < 4; i++) expr = `replace(${expr}, '  ', ' ')`;
  return `trim(${expr})`;
}

async function addColumnIfMissing(
  table: string,
  column: string,
  decl: string
): Promise<boolean> {
  const client = await getClient();
  const info = await client.execute(`PRAGMA table_info(${table})`);
  // No rows at all means the table doesn't exist yet (PRAGMA doesn't error on
  // a missing table). Nothing to migrate — whatever creates it will include
  // the column. Relevant on a fresh database, where `records` only appears
  // with the first catalogue upload.
  if (info.rows.length === 0) return false;
  if (info.rows.some((r) => String((r as unknown as { name: string }).name) === column)) return true;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  return true;
}

/** Fills in record_key for a catalogue imported before that column existed.
 * Only an import writes the column, so without this every record loaded
 * earlier has no key until the next upload — and the modification log can't
 * link to any of them in the meantime. Returns how many rows were filled.
 *
 * Deliberately one server-side UPDATE rather than reading 135k rows out to
 * compute keys in JavaScript and writing them back. Guarded by an
 * index-backed existence check, so it costs nothing once it has run. */
export async function backfillRecordKeys(): Promise<number> {
  const client = await getClient();
  const pending = await client.execute(`SELECT 1 FROM records WHERE record_key IS NULL LIMIT 1`);
  if (pending.rows.length === 0) return 0;

  const res = await client.execute(`
    UPDATE records SET record_key = CASE
      WHEN ${sqlNormKey("matrix_number")} <> ''
        THEN 'mx:' || ${sqlNormKey("matrix_number")}
      ELSE 'lk:' || ${sqlNormKey("label_number")}
                || '|' || ${sqlNormKey("artist")}
                || '|' || ${sqlNormKey("title")}
    END
    WHERE record_key IS NULL
  `);
  return Number(res.rowsAffected ?? 0);
}

function ensureOverlayTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.executeMultiple(`
        CREATE TABLE IF NOT EXISTS editor_field_edits (
          record_key   TEXT NOT NULL,
          field        TEXT NOT NULL,
          value        TEXT,
          base_value   TEXT,
          has_base     INTEGER NOT NULL DEFAULT 0,
          record_label TEXT,
          record_id    INTEGER,
          editor_id    INTEGER,
          editor_name  TEXT,
          updated_at   TEXT NOT NULL,
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
        -- Records an editor has removed. Deleting only from the records table
        -- would be undone by the next catalogue upload, which rebuilds from the
        -- compiler's spreadsheet, so a deletion is stored here as a tombstone
        -- and the import skips any row whose key matches (streamTargetRows).
        CREATE TABLE IF NOT EXISTS editor_deleted_records (
          record_key   TEXT PRIMARY KEY,
          record_label TEXT,
          editor_id    INTEGER,
          editor_name  TEXT,
          deleted_at   TEXT NOT NULL
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

      // Migrate pre-existing editor_field_edits tables that lack the new
      // columns (added for the 3-way merge and the edits admin view).
      await addColumnIfMissing("editor_field_edits", "base_value", "TEXT");
      await addColumnIfMissing("editor_field_edits", "has_base", "INTEGER NOT NULL DEFAULT 0");
      await addColumnIfMissing("editor_field_edits", "record_label", "TEXT");
      await addColumnIfMissing("editor_field_edits", "record_id", "INTEGER");

      // The compiler's review pass over the log: a tick for "I've checked this
      // one", and a note back to the editor who made the change (so a query
      // doesn't have to happen over email).
      await addColumnIfMissing("modification_log", "reviewed_at", "TEXT");
      await addColumnIfMissing("modification_log", "reviewed_by", "TEXT");
      await addColumnIfMissing("modification_log", "note", "TEXT");
      await addColumnIfMissing("modification_log", "note_at", "TEXT");
      await addColumnIfMissing("modification_log", "note_by", "TEXT");

      // `records` is rebuilt by the importer, which creates the column itself
      // (lib/db/ddl.ts) — but a catalogue imported before that existed, or one
      // brought back by restorePrevious from an older generation, won't have
      // it. Added here so the log's record lookups always have a column to
      // match on. Backfilling the values isn't possible from SQL (the key is
      // derived in JS); the next upload fills them in.
      if (await addColumnIfMissing("records", "record_key", "TEXT")) {
        await client.execute(
          `CREATE INDEX IF NOT EXISTS idx_records_record_key ON records(record_key)`
        );
        await backfillRecordKeys();
      }

      // Backfill the "base" (dad's value when the edit was first made) for
      // existing edits from the earliest modification-log entry for that
      // record+field. Only marks has_base=1 where such an entry exists; edits
      // without a known base fall back to "correction always wins".
      await client.execute(`
        UPDATE editor_field_edits
           SET base_value = (
                 SELECT ml.old_value FROM modification_log ml
                  WHERE ml.record_key = editor_field_edits.record_key
                    AND ml.field = editor_field_edits.field
                  ORDER BY ml.id ASC LIMIT 1
               ),
               has_base = 1
         WHERE has_base = 0
           AND EXISTS (
                 SELECT 1 FROM modification_log ml
                  WHERE ml.record_key = editor_field_edits.record_key
                    AND ml.field = editor_field_edits.field
               )
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
  b_side_artist: "lower(b_side_artist)", b_side_artist_credit: "lower(b_side_artist_credit)",
  b_side_title: "lower(b_side_title)", b_side_title_credit: "lower(b_side_title_credit)",
  b_side_matrix_number: "lower(b_side_matrix_number)", b_side_label_number: "lower(b_side_label_number)",
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
  // A human-readable label for the edits admin view, captured now while we have
  // the record in hand (edits are keyed by content, not a joinable id).
  const recordLabel =
    [nullIfBlank(current.artist), nullIfBlank(current.title)].filter(Boolean).join(" – ") || null;
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
      // base_value / has_base capture dad's value at the moment of the FIRST
      // edit (the INSERT). On a later edit to the same field it's a conflict, so
      // DO UPDATE deliberately leaves base_value/has_base/record_label untouched
      // — the base always reflects dad's original value, which is what the
      // 3-way import merge compares his new uploads against.
      statements.push({
        sql: `INSERT INTO editor_field_edits
                (record_key, field, value, base_value, has_base, record_label, record_id, editor_id, editor_name, updated_at)
              VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
              ON CONFLICT(record_key, field) DO UPDATE SET
                value = excluded.value, record_label = excluded.record_label,
                record_id = excluded.record_id, editor_id = excluded.editor_id,
                editor_name = excluded.editor_name, updated_at = excluded.updated_at`,
        args: [key, field, newValue, oldValue, recordLabel, recordId, editorIdArg(editor.uid), editor.name, now],
      });
    }

    statements.push({
      sql: `INSERT INTO modification_log
              (record_key, record_id, action, field, old_value, new_value, editor_id, editor_name, created_at)
            VALUES (?, ?, 'modified', ?, ?, ?, ?, ?, ?)`,
      args: [key, recordId, field, oldValue, newValue, editorIdArg(editor.uid), editor.name, now],
    });
  }

  // Pin the row to the key the overlay filed this edit under. Two reasons:
  // it heals a row whose key predates the column (nothing can backfill an
  // editor-created record otherwise), and editing artist/title/matrix/label
  // number changes what computeRecordKey would return for the row — but the
  // overlay still tracks it under the compiler's original key, so that is the
  // key the row has to keep for the modification log to find it.
  statements.push({
    sql: `UPDATE records SET record_key = ? WHERE id = ?`,
    args: [key, recordId],
  });

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
  // Without this the row has no key, so nothing in the modification log can
  // find it and the log shows no record link for anything an editor added.
  cols.push("record_key");
  vals.push(key);
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
  id: number;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  editor_name: string | null;
  created_at: string;
  /** The compiler's note back to the editor about this change, if any. */
  note: string | null;
  note_by: string | null;
  note_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

const LOG_COLUMNS =
  "id, action, field, old_value, new_value, editor_name, created_at, note, note_by, note_at, reviewed_at, reviewed_by";

/** The change history for one record (newest first), for the per-record log. */
export async function getRecordLog(recordKey: string, limit = 50): Promise<LogEntry[]> {
  await ensureOverlayTables();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT ${LOG_COLUMNS}
          FROM modification_log WHERE record_key = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    args: [recordKey, limit],
  });
  return res.rows as unknown as LogEntry[];
}

/** Reads the whole overlay for the import merge (Phase 3): every field
 * override and every editor-added record. Both sets are editor-generated and
 * modest in size, so loading them into memory to merge against the parsed CSV
 * is fine. Ensures the tables exist first, so a first-ever import on a fresh
 * database just gets two empty lists and behaves exactly as before. */
export async function getOverlayForMerge(): Promise<{
  fieldEdits: {
    record_key: string;
    field: string;
    value: string | null;
    base_value: string | null;
    has_base: boolean;
  }[];
  editorRecords: { record_key: string; data: Record<string, string | null> }[];
  deletedKeys: string[];
}> {
  await ensureOverlayTables();
  const client = await getClient();
  const fe = await client.execute(
    `SELECT record_key, field, value, base_value, has_base FROM editor_field_edits`
  );
  const er = await client.execute(`SELECT record_key, data FROM editor_records`);
  const del = await client.execute(`SELECT record_key FROM editor_deleted_records`);
  return {
    deletedKeys: del.rows.map((r) => String(r.record_key)),
    fieldEdits: fe.rows.map((r) => ({
      record_key: String(r.record_key),
      field: String(r.field),
      value: r.value == null ? null : String(r.value),
      base_value: r.base_value == null ? null : String(r.base_value),
      has_base: Number(r.has_base) === 1,
    })),
    editorRecords: er.rows.map((r) => {
      let data: Record<string, string | null> = {};
      try {
        data = JSON.parse(String(r.data));
      } catch {
        data = {};
      }
      return { record_key: String(r.record_key), data };
    }),
  };
}

export interface FieldEditRow {
  record_key: string;
  field: string;
  value: string | null;
  base_value: string | null;
  has_base: boolean;
  record_label: string | null;
  record_id: number | null;
  editor_name: string | null;
  updated_at: string;
}

/** All active field overrides, newest first — for the admin "Edits" view. */
export async function listFieldEdits(): Promise<FieldEditRow[]> {
  await ensureOverlayTables();
  const client = await getClient();
  const res = await client.execute(
    `SELECT record_key, field, value, base_value, has_base, record_label, record_id, editor_name, updated_at
     FROM editor_field_edits ORDER BY updated_at DESC`
  );
  return res.rows.map((r) => ({
    record_key: String(r.record_key),
    field: String(r.field),
    value: r.value == null ? null : String(r.value),
    base_value: r.base_value == null ? null : String(r.base_value),
    has_base: Number(r.has_base) === 1,
    record_label: r.record_label == null ? null : String(r.record_label),
    record_id: r.record_id == null ? null : Number(r.record_id),
    editor_name: r.editor_name == null ? null : String(r.editor_name),
    updated_at: String(r.updated_at),
  }));
}

export interface DeletedRecordRow {
  record_key: string;
  record_label: string | null;
  editor_name: string | null;
  deleted_at: string;
}

/** Removes a record from the live catalogue.
 *
 * A plain DELETE would be silently undone by the next catalogue upload, which
 * rebuilds from the compiler's spreadsheet — so the removal is also recorded as
 * a tombstone that the importer honours (see streamTargetRows). An
 * editor-CREATED record has no spreadsheet row to come back from, so that case
 * just drops its editor_records entry instead of leaving a tombstone behind.
 * Any field overrides for the record are cleared too: they have nothing left to
 * apply to, and would otherwise linger in the overrides list forever.
 *
 * Returns false when the id no longer resolves to a record. */
export async function deleteRecord(recordId: number, editor: EditorInfo): Promise<boolean> {
  await ensureOverlayTables();
  const client = await getClient();

  const cur = await client.execute({
    sql: `SELECT ${EDITABLE_FIELDS.join(", ")} FROM records WHERE id = ? LIMIT 1`,
    args: [recordId],
  });
  const current = cur.rows[0] as unknown as Record<EditableField, string | null> | undefined;
  if (!current) return false;

  const key = computeRecordKey(current);
  const label =
    [nullIfBlank(current.artist), nullIfBlank(current.title)].filter(Boolean).join(" – ") || null;
  const isEditorRecord =
    (await client.execute({ sql: `SELECT 1 FROM editor_records WHERE record_key = ? LIMIT 1`, args: [key] }))
      .rows.length > 0;

  const now = new Date().toISOString();
  const statements: { sql: string; args: (string | number | null)[] }[] = [
    { sql: `DELETE FROM records WHERE id = ?`, args: [recordId] },
    { sql: `DELETE FROM records_fts WHERE rowid = ?`, args: [recordId] },
    { sql: `DELETE FROM records_catalog_fts WHERE rowid = ?`, args: [recordId] },
    { sql: `DELETE FROM editor_field_edits WHERE record_key = ?`, args: [key] },
  ];

  if (isEditorRecord) {
    statements.push({ sql: `DELETE FROM editor_records WHERE record_key = ?`, args: [key] });
  } else {
    statements.push({
      sql: `INSERT INTO editor_deleted_records (record_key, record_label, editor_id, editor_name, deleted_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(record_key) DO UPDATE SET
              record_label = excluded.record_label, editor_id = excluded.editor_id,
              editor_name = excluded.editor_name, deleted_at = excluded.deleted_at`,
      args: [key, label, editorIdArg(editor.uid), editor.name, now],
    });
  }

  statements.push({
    sql: `INSERT INTO modification_log
            (record_key, record_id, action, field, old_value, new_value, editor_id, editor_name, created_at)
          VALUES (?, ?, 'deleted', NULL, ?, NULL, ?, ?, ?)`,
    args: [key, recordId, label, editorIdArg(editor.uid), editor.name, now],
  });

  await client.batch(statements, "write");
  return true;
}

/** Deleted base records, newest first — for the admin view. Editor-created
 * records aren't listed: deleting one removes it outright, nothing to restore. */
export async function listDeletedRecords(): Promise<DeletedRecordRow[]> {
  await ensureOverlayTables();
  const client = await getClient();
  const res = await client.execute(
    `SELECT record_key, record_label, editor_name, deleted_at
     FROM editor_deleted_records ORDER BY deleted_at DESC`
  );
  return res.rows.map((r) => ({
    record_key: String(r.record_key),
    record_label: r.record_label == null ? null : String(r.record_label),
    editor_name: r.editor_name == null ? null : String(r.editor_name),
    deleted_at: String(r.deleted_at),
  }));
}

/** Lifts a tombstone. The row itself returns on the next catalogue upload,
 * since that's what re-materialises the compiler's data. */
export async function restoreDeletedRecord(recordKey: string, editor: EditorInfo): Promise<void> {
  await ensureOverlayTables();
  const client = await getClient();
  await client.batch(
    [
      { sql: `DELETE FROM editor_deleted_records WHERE record_key = ?`, args: [recordKey] },
      {
        sql: `INSERT INTO modification_log
                (record_key, record_id, action, field, old_value, new_value, editor_id, editor_name, created_at)
              VALUES (?, NULL, 'restored', NULL, NULL, NULL, ?, ?, ?)`,
        args: [recordKey, editorIdArg(editor.uid), editor.name, new Date().toISOString()],
      },
    ],
    "write"
  );
}

/** Removes a field override: reverts the live record's field back to dad's
 * original value (the stored base) when we can still locate that record, then
 * deletes the edit so it no longer re-applies on import. Returns whether the
 * live record was reverted in place (false just means it'll correct on the next
 * upload). */
export async function removeFieldEdit(recordKey: string, field: string): Promise<boolean> {
  await ensureOverlayTables();
  if (!EDITABLE_FIELDS.includes(field as EditableField)) return false;
  const client = await getClient();

  const res = await client.execute({
    sql: `SELECT value, base_value, record_id FROM editor_field_edits WHERE record_key = ? AND field = ? LIMIT 1`,
    args: [recordKey, field],
  });
  const edit = res.rows[0];
  if (!edit) return false;
  const baseValue = edit.base_value == null ? null : String(edit.base_value);
  const recordId = edit.record_id == null ? null : Number(edit.record_id);

  const statements: { sql: string; args: (string | number | null)[] }[] = [];
  let revertedLive = false;

  // Only touch the live record if the stored id still points at the same record
  // (ids can be reassigned by a full rebuild). Verify by content key first.
  if (recordId != null) {
    const cur = await client.execute({
      sql: `SELECT ${EDITABLE_FIELDS.join(", ")} FROM records WHERE id = ? LIMIT 1`,
      args: [recordId],
    });
    const current = cur.rows[0] as unknown as Record<EditableField, string | null> | undefined;
    if (current && computeRecordKey(current) === recordKey) {
      const setPairs: [string, string | number | null][] = [[field, baseValue]];
      const f = field as EditableField;
      if (NORM_MAP[f]) setPairs.push([NORM_MAP[f]!, baseValue ? baseValue.toLowerCase() : null]);
      if (f === "year") setPairs.push(["year_sort", deriveYearSort(baseValue)]);
      statements.push({
        sql: `UPDATE records SET ${setPairs.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`,
        args: [...setPairs.map(([, v]) => v), recordId],
      });
      statements.push(...ftsRefreshStatements(recordId));
      statements.push({
        sql: `INSERT INTO modification_log
                (record_key, record_id, action, field, old_value, new_value, editor_id, editor_name, created_at)
              VALUES (?, ?, 'reverted', ?, ?, ?, NULL, ?, ?)`,
        args: [recordKey, recordId, field, String(edit.value ?? ""), baseValue, "admin (edit removed)", new Date().toISOString()],
      });
      revertedLive = true;
    }
  }

  statements.push({
    sql: `DELETE FROM editor_field_edits WHERE record_key = ? AND field = ?`,
    args: [recordKey, field],
  });

  await client.batch(statements, "write");
  return revertedLive;
}

export interface GlobalLogEntry extends LogEntry {
  /** The record's id as it was when the change was made. Kept only as a
   * fallback: see live_record_id. */
  record_id: number | null;
  /** Where the record lives NOW. Ids don't survive editing — a full rebuild
   * renumbers the whole catalogue, and the diff importer replaces a changed
   * record with a fresh id — so the id stored alongside the log entry goes
   * stale precisely for the records that have been worked on. Resolved
   * through record_key, which is content-derived and does survive. */
  live_record_id: number | null;
}

/** Which slice of the log to show. The compiler works through it in review
 * passes, so "what haven't I checked yet" is the view that matters most. */
export type LogFilter = "all" | "unreviewed" | "reviewed" | "noted";

const LOG_FILTER_SQL: Record<LogFilter, string> = {
  all: "",
  unreviewed: "WHERE reviewed_at IS NULL",
  reviewed: "WHERE reviewed_at IS NOT NULL",
  noted: "WHERE note IS NOT NULL AND note <> ''",
};

export function parseLogFilter(value: string | undefined): LogFilter {
  return value === "unreviewed" || value === "reviewed" || value === "noted" ? value : "all";
}

/** The global modification log (newest first), paginated. Defaults to the
 * site-wide PAGE_SIZE so the shared Pagination component (which derives the
 * page count from that same constant) stays in agreement. */
export async function getGlobalLog(
  page: number,
  filter: LogFilter = "all",
  pageSize = PAGE_SIZE
): Promise<{ entries: GlobalLogEntry[]; total: number; unreviewed: number }> {
  await ensureOverlayTables();
  const client = await getClient();
  const where = LOG_FILTER_SQL[filter];

  const [totalRes, unreviewedRes] = await Promise.all([
    client.execute(`SELECT COUNT(*) AS c FROM modification_log ${where}`),
    client.execute(`SELECT COUNT(*) AS c FROM modification_log WHERE reviewed_at IS NULL`),
  ]);

  const res = await client.execute({
    sql: `SELECT ${LOG_COLUMNS}, record_id, record_key
          FROM modification_log ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    args: [pageSize, (page - 1) * pageSize],
  });
  const rows = res.rows as unknown as (GlobalLogEntry & { record_key: string | null })[];
  const live = await resolveLiveRecordIds(rows);
  const entries = rows.map((r, i) => ({ ...r, live_record_id: live[i] }));

  return {
    entries,
    total: Number(totalRes.rows[0]?.c ?? 0),
    unreviewed: Number(unreviewedRes.rows[0]?.c ?? 0),
  };
}

/** Finds where each log entry's record lives now, for one page of entries.
 *
 * Two lookups, because neither alone is sufficient. The record_key column on
 * `records` is the reliable one, but it's only filled in by an import, so it's
 * empty on a catalogue loaded before it existed. The record_id stored on the
 * log entry covers that gap — but it's stale whenever the record has been
 * edited since, so it can't be trusted blind: the candidate row is read back
 * and its key recomputed, and it only counts if it still identifies the same
 * record. Anything that fails both is genuinely unreachable (deleted, or
 * renamed in a way that changed its key) and resolves to null rather than to a
 * confidently wrong link. */
async function resolveLiveRecordIds(
  rows: { record_key: string | null; record_id: number | null }[]
): Promise<(number | null)[]> {
  const client = await getClient();
  const out: (number | null)[] = rows.map(() => null);

  const keys = [...new Set(rows.map((r) => r.record_key).filter((k): k is string => !!k))];
  const byKey = new Map<string, number>();
  if (keys.length > 0) {
    try {
      const res = await client.execute({
        sql: `SELECT id, record_key FROM records WHERE record_key IN (${keys.map(() => "?").join(", ")})`,
        args: keys,
      });
      for (const r of res.rows) {
        const rr = r as unknown as { id: number; record_key: string };
        if (!byKey.has(rr.record_key)) byKey.set(rr.record_key, Number(rr.id));
      }
    } catch {
      // The column is missing — a catalogue restored from a generation built
      // before it existed, until the next cold start migrates it back in.
      // The verified-id pass below still resolves most entries, so the log
      // stays usable rather than erroring out.
    }
  }

  const unresolved: number[] = [];
  rows.forEach((r, i) => {
    const hit = r.record_key ? byKey.get(r.record_key) : undefined;
    if (hit != null) out[i] = hit;
    else if (r.record_id != null) unresolved.push(i);
  });

  if (unresolved.length > 0) {
    const ids = [...new Set(unresolved.map((i) => rows[i].record_id as number))];
    const res = await client.execute({
      sql: `SELECT id, matrix_number, label_number, artist, title
            FROM records WHERE id IN (${ids.map(() => "?").join(", ")})`,
      args: ids,
    });
    const keyById = new Map<number, string>();
    for (const r of res.rows) {
      const rr = r as unknown as {
        id: number;
        matrix_number: string | null;
        label_number: string | null;
        artist: string | null;
        title: string | null;
      };
      keyById.set(Number(rr.id), computeRecordKey(rr));
    }
    for (const i of unresolved) {
      const id = rows[i].record_id as number;
      // Only accept the stored id if the row still there is the same record.
      if (keyById.get(id) === rows[i].record_key) out[i] = id;
    }
  }

  return out;
}

/** Ticks (or un-ticks) a log entry as reviewed by the compiler. */
export async function setLogReviewed(
  logId: number,
  reviewed: boolean,
  reviewerName: string
): Promise<void> {
  await ensureOverlayTables();
  const client = await getClient();
  await client.execute({
    sql: `UPDATE modification_log SET reviewed_at = ?, reviewed_by = ? WHERE id = ?`,
    args: reviewed ? [new Date().toISOString(), reviewerName, logId] : [null, null, logId],
  });
}

/** Leaves (or clears) a note on a log entry. The editor who made the change
 * sees it on the record's own page, so a query doesn't need an email. */
export async function setLogNote(
  logId: number,
  note: string,
  authorName: string
): Promise<void> {
  await ensureOverlayTables();
  const client = await getClient();
  const trimmed = note.trim().slice(0, 2000);
  await client.execute({
    sql: `UPDATE modification_log SET note = ?, note_by = ?, note_at = ? WHERE id = ?`,
    args: trimmed
      ? [trimmed, authorName, new Date().toISOString(), logId]
      : [null, null, null, logId],
  });
}

/** How many changes the compiler still has to look at — drives the pointer on
 * the admin page so a review pass can be picked up where it left off. */
export async function countUnreviewedLog(): Promise<number> {
  await ensureOverlayTables();
  const client = await getClient();
  const res = await client.execute(
    `SELECT COUNT(*) AS c FROM modification_log WHERE reviewed_at IS NULL`
  );
  return Number(res.rows[0]?.c ?? 0);
}

/** Notes left on this editor's own changes — drives the "the compiler left you
 * a note" pointer they see when they sign in. */
export async function countNotesForEditor(editorName: string): Promise<number> {
  await ensureOverlayTables();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT COUNT(*) AS c FROM modification_log
          WHERE note IS NOT NULL AND note <> '' AND editor_name = ?`,
    args: [editorName],
  });
  return Number(res.rows[0]?.c ?? 0);
}
