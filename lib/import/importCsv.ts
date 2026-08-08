import crypto from "node:crypto";
import { Readable } from "node:stream";
import iconv from "iconv-lite";
import { parse } from "csv-parse";
import { getClient } from "@/lib/db/client";
import {
  buildTableDdl,
  buildIndexStatements,
  CATALOG_FTS_COLUMNS,
  STAGING_TABLE,
  STAGING_FTS_TABLE,
  STAGING_CATALOG_FTS_TABLE,
} from "@/lib/db/ddl";
import { computeRecordKey, EDITABLE_FIELDS, getOverlayForMerge } from "@/lib/editor/overlay";

// Exact column order of the RKR.csv export. Every name here becomes a
// `records` column of the same name. Any columns beyond index 23 (the
// "Unnamed: 24-28" trailing junk columns pandas reports) are never read, by
// construction, since we only ever index into this array.
//
// Index 9 (source column J) was long treated as an empty spacer and dropped
// under the name `blank1`. It isn't empty: it's a sparse (~6%) but
// collector-relevant "pressing" note — "reissue", "pre" (pre-release), and the
// like — that the compiler asked to surface, so it's now a real field.
export const CSV_FIELDS = [
  "artist",
  "artist_credit",
  "title",
  "title_credit",
  "matrix_number",
  "label_number",
  "label",
  "country",
  "format",
  "pressing",
  "producer",
  "year",
  "riddim",
  "version",
  "b_side_artist",
  "b_side_artist_credit",
  "b_side_title",
  "b_side_title_credit",
  "b_side_matrix_number",
  "b_side_label_number",
  "song_origin",
  "notes",
  "genre",
  "additions",
] as const;

// Every parsed field is now a real column (the former `blank1` spacer became
// `pressing`), so all of CSV_FIELDS is inserted.
const INSERT_COLUMNS = [...CSV_FIELDS];
// Exported so the diff importer (lib/import/diffImport.ts) writes exactly the
// same columns in the same order as the full rebuild.
export const FTS_COLUMNS = ["title", "title_credit", "artist", "artist_credit", "notes"] as const;

// Source expression for each CATALOG_FTS_COLUMNS entry, evaluated against
// the staging table in the INSERT...SELECT below. _norm columns are reused
// as-is (already lowercased in JS during parsing); raw columns are
// lower()'d in SQL so the whole catalog_fts table is uniformly lowercase —
// see the comment on CATALOG_FTS_COLUMNS in lib/db/ddl.ts.
export const CATALOG_FTS_SOURCE_EXPR: Record<(typeof CATALOG_FTS_COLUMNS)[number], string> = {
  artist: "artist_norm",
  title: "lower(title)",
  label: "label_norm",
  label_number: "lower(label_number)",
  matrix_number: "lower(matrix_number)",
  producer: "producer_norm",
  country: "country_norm",
  format: "format_norm",
  year: "lower(year)",
  genre: "genre_norm",
  riddim: "riddim_norm",
  origin: "origin_norm",
  notes: "lower(notes)",
  // B-side fields have no _norm columns, so lower() the raw value in SQL
  // (same treatment as title/label_number/matrix_number above).
  b_side_artist: "lower(b_side_artist)",
  b_side_artist_credit: "lower(b_side_artist_credit)",
  b_side_title: "lower(b_side_title)",
  b_side_title_credit: "lower(b_side_title_credit)",
  b_side_matrix_number: "lower(b_side_matrix_number)",
  b_side_label_number: "lower(b_side_label_number)",
};

// _norm columns, computed here in JS and inserted as plain values rather
// than left as SQL GENERATED/STORED expressions — see the comment on
// buildTableDdl in lib/db/ddl.ts for why (Turso's per-row expression
// evaluation cost was the dominant bottleneck in a full import, per testing).
const NORM_COLUMNS = [
  "artist_norm",
  "label_norm",
  "producer_norm",
  "riddim_norm",
  "country_norm",
  "origin_norm",
  "genre_norm",
  "format_norm",
] as const;
const NORM_SOURCE_FIELDS = [
  "artist",
  "label",
  "producer",
  "riddim",
  "country",
  "song_origin",
  "genre",
  "format",
] as const;

// A human-readable progress reporter. The import calls it at each phase so the
// caller can stream live status to the browser (see the import-from-blob route)
// and/or write it to the server logs. Optional everywhere — a plain import that
// passes nothing behaves exactly as before.
export type ProgressFn = (message: string) => void;

function nullIfBlank(value: string | undefined | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function deriveYearSort(year: string | null): number | null {
  if (!year) return null;
  const match = year.match(/(\d{4})/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (n < 1850 || n > 2100) return null;
  return n;
}

// A parsed row as a field→value map (keyed by CSV_FIELDS names). Kept in this
// shape rather than pre-flattened to positional tuples so the overlay merge
// (mergeOverlay below) can read and fill individual fields by name before the
// row is turned into insert values.
export type FieldRow = Record<string, string | null>;

// Decode the upload, auto-detecting UTF-8 vs Windows-1252.
//
// The original RKR.csv export was Windows-1252 (confirmed encoding), and this
// used to hard-decode that. But when the compiler moved to maintaining the
// catalogue in Excel, the export became genuine UTF-8 — and it contains
// characters cp1252 simply cannot represent: Greek Δ/τ/α and symbols like
// ✳ ◇ ✴ ∙ used inside matrix numbers as stamper marks (hundreds of them, a
// primary search key). Decoding those as cp1252 silently replaced them,
// corrupting the numbers. So try UTF-8 strictly first (TextDecoder with
// fatal:true throws on any invalid sequence); only if that fails fall back to
// cp1252, which covers the older-style exports. A pure-ASCII file decodes
// identically either way, so this is safe for every prior file too.
function decodeUpload(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch {
    return iconv.decode(buffer, "win1252");
  }
}

/** Streams a .csv upload row-by-row (header skipped, first 24 columns in
 * CSV_FIELDS order) instead of materializing every row up front — so a very
 * large catalogue never has to sit in memory all at once (see buildStagingTables). */
async function* parseCsvRows(buffer: Buffer): AsyncGenerator<FieldRow> {
  const text = decodeUpload(buffer);
  const parser = parse(text, {
    columns: false,
    from_line: 2, // skip header row
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });
  for await (const row of parser as AsyncIterable<string[]>) {
    if (!row.some((cell) => cell && cell.trim() !== "")) continue; // drop fully blank lines
    const byField: FieldRow = {};
    CSV_FIELDS.forEach((f, i) => {
      byField[f] = nullIfBlank(row[i]);
    });
    yield byField;
  }
}

// XLSX files are ZIP archives, which always start with the "PK\x03\x04" magic
// bytes; a CSV is plain text and never does. This tells the two apart so an
// upload can be either the CSV export or the original Excel workbook.
function isXlsxBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

// A single Excel cell's value can be a string, a number, a date, a formula
// ({ result }), a hyperlink ({ text }) or rich text ({ richText }). Flatten any
// of those to the plain string the importer expects.
function xlsxCellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return String(v.getUTCFullYear());
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

/** Streams an uploaded .xlsx row-by-row: the first worksheet, header row
 * skipped, first 24 columns in CSV_FIELDS order. Uses exceljs's streaming
 * reader AND yields each row rather than collecting them, so a 130k-row
 * workbook stays at a couple hundred MB instead of holding every parsed row in
 * memory at once (measured: ~200MB streamed vs ~700MB materialized). */
async function* parseXlsxRows(buffer: Buffer): AsyncGenerator<FieldRow> {
  const ExcelJS = (await import("exceljs")).default;
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    worksheets: "emit",
    sharedStrings: "cache",
  });

  let sheetIndex = 0;
  for await (const worksheet of reader) {
    sheetIndex++;
    if (sheetIndex > 1) break; // the catalogue lives on the first sheet
    let rowNumber = 0;
    for await (const row of worksheet) {
      rowNumber++;
      if (rowNumber === 1) continue; // header row, skipped like the CSV path
      const values = row.values as unknown[]; // 1-indexed; values[0] is undefined
      const byField: FieldRow = {};
      let hasAny = false;
      CSV_FIELDS.forEach((f, i) => {
        const cell = nullIfBlank(xlsxCellToString(values[i + 1]));
        byField[f] = cell;
        if (cell !== null) hasAny = true;
      });
      if (hasAny) yield byField; // drop fully-blank rows
    }
  }
}

/** Streams an uploaded catalogue file, accepting either the CSV export or the
 * original Excel workbook — chosen by the file's bytes, not its name. */
function parseUploadRows(buffer: Buffer): AsyncGenerator<FieldRow> {
  return isXlsxBuffer(buffer) ? parseXlsxRows(buffer) : parseCsvRows(buffer);
}

function insertPartsFor(byField: FieldRow): {
  values: (string | null)[];
  yearSort: number | null;
  norms: (string | null)[];
} {
  return {
    values: INSERT_COLUMNS.map((f) => byField[f] ?? null),
    yearSort: deriveYearSort(byField.year ?? null),
    norms: NORM_SOURCE_FIELDS.map((f) => {
      const v = byField[f];
      return v ? v.toLowerCase() : null;
    }),
  };
}

const CHUNK_SIZE = 500;
// Grouping several chunks into one batch() call turns that many round trips
// into one. Against a remote Turso database, many small sequential round trips
// were both slow and fragile — a single transient timeout on any one of them
// failed the whole import (confirmed by testing against a real Turso database).
// Batching cuts the round-trip count by this factor.
const CHUNKS_PER_BATCH = 10;

/** Builds a fresh "staging" generation of the data (records_new /
 * records_new_fts) from a CSV or XLSX buffer, inside the database the app is
 * already connected to (local file or Turso — same code either way). Does
 * not touch the live `records` table; the caller (atomicSwap.ts) is
 * responsible for swapping the staging tables into place. Ids are assigned
 * explicitly (not via AUTOINCREMENT) so the same id can be used later to
 * populate the FTS table by id, not transmitted a second time.
 *
 * The upload is STREAMED: rows are parsed and inserted in batches as they go,
 * so the whole catalogue is never held in memory at once (a 135k-row .xlsx
 * peaked at ~1.2GB when fully materialized — enough to OOM a serverless
 * function and return a non-JSON platform error to the browser; streaming
 * keeps it near ~200-300MB). The editor overlay is loaded up front (it's
 * editor-generated, so small) and applied to each row as it streams past. */
/** Yields the FINAL target set of records for an import: every row from the
 * uploaded file with the editor overlay's field-edits applied ON TOP (a correction
 * wins over dad's value), followed by any editor-added records the file doesn't
 * contain. This is the single source of truth for "what the catalogue should be"
 * — used by BOTH the full rebuild (buildStagingTables) and the incremental diff
 * (lib/import/diffImport.ts), so the two can never disagree about the target
 * state. Streamed, so memory stays flat. */
export async function* streamTargetRows(
  csvBuffer: Buffer,
  onProgress?: ProgressFn
): AsyncGenerator<FieldRow> {
  // The editor overlay, indexed by record key. Field edits (including approved
  // AI typo fixes, which are stored as edits) OVERRIDE the uploaded value, so a
  // correction made on the site isn't wiped out when dad re-uploads his older
  // spreadsheet that still has the old value. Editor-added records the file
  // doesn't contain are appended at the end; any the file now contains are
  // dropped (his version wins for whole new records). Records are matched by
  // computeRecordKey (matrix number, else label no + artist + title).
  const { fieldEdits, editorRecords, deletedKeys } = await getOverlayForMerge();
  // Records an editor deleted. The uploaded file still contains them (it's the
  // compiler's own spreadsheet), so without this the next upload would quietly
  // resurrect every deleted entry.
  const deleted = new Set(deletedKeys);
  const editable = new Set<string>(EDITABLE_FIELDS);
  const fieldEditsByKey = new Map<
    string,
    { field: string; value: string; base: string | null; hasBase: boolean }[]
  >();
  for (const e of fieldEdits) {
    if (e.value == null || !editable.has(e.field)) continue;
    const entry = { field: e.field, value: e.value, base: e.base_value, hasBase: e.has_base };
    const list = fieldEditsByKey.get(e.record_key);
    if (list) list.push(entry);
    else fieldEditsByKey.set(e.record_key, [entry]);
  }
  const editorRecordsByKey = new Map<string, Record<string, string | null>>();
  for (const er of editorRecords) editorRecordsByKey.set(er.record_key, er.data);

  let skippedDeleted = 0;
  for await (const row of parseUploadRows(csvBuffer)) {
    const key = computeRecordKey(row);
    if (deleted.has(key)) {
      skippedDeleted++;
      continue;
    }
    const edits = fieldEditsByKey.get(key);
    if (edits) {
      for (const { field, value, base, hasBase } of edits) {
        // Three-way merge between dad's uploaded value, the base (his value when
        // the edit was made), and the on-site correction:
        //   • no known base (legacy edit) → correction wins (safe default)
        //   • dad's value unchanged from base → correction wins (propagates)
        //   • dad changed it to something genuinely new → dad wins (leave it)
        const dadValue = nullIfBlank(row[field]);
        if (!hasBase || dadValue === base) row[field] = value;
        // else: dad deliberately changed this field since the edit — keep his
        // new value; the now-superseded edit simply stops applying.
      }
    }
    // Dad's file contains this record → his version wins; drop the editor copy.
    if (editorRecordsByKey.size > 0) editorRecordsByKey.delete(key);
    yield row;
  }

  // Append editor-added records not present in dad's file.
  let editorAppended = 0;
  for (const data of editorRecordsByKey.values()) {
    const row: FieldRow = {};
    for (const f of CSV_FIELDS) row[f] = null;
    for (const f of EDITABLE_FIELDS) row[f] = nullIfBlank(data[f] ?? null);
    editorAppended++;
    yield row;
  }
  if (editorAppended > 0) {
    onProgress?.(`Re-applied ${editorAppended.toLocaleString()} editor-added record(s).`);
  }
  if (skippedDeleted > 0) {
    onProgress?.(`Kept ${skippedDeleted.toLocaleString()} editor-deleted record(s) out.`);
  }
}

// The full ordered column list a records row is written with (the 24 catalogue
// fields + year_sort + the 8 _norm columns), and a matching values builder.
// Shared with the diff importer so an inserted row is byte-identical either way.
export const RECORD_INSERT_COLUMNS = [...INSERT_COLUMNS, "year_sort", ...NORM_COLUMNS];
export function recordInsertValues(byField: FieldRow): (string | number | null)[] {
  const { values, yearSort, norms } = insertPartsFor(byField);
  return [...values, yearSort, ...norms];
}

/** A stable fingerprint of a record's 24 catalogue fields. Both the live
 * catalogue and a fresh upload normalize identically (null/blank → ""), so two
 * records with the same content produce the same hash — which is how the diff
 * importer tells unchanged rows (skip) from new/changed ones (write). */
export function contentHashOf(row: Record<string, string | null>): string {
  const parts = CSV_FIELDS.map((f) => row[f] ?? "");
  return crypto.createHash("sha1").update(parts.join("")).digest("base64");
}

export async function buildStagingTables(
  csvBuffer: Buffer,
  onProgress?: ProgressFn
): Promise<{ rowCount: number }> {
  const client = await getClient();

  await client.executeMultiple(`
    DROP TABLE IF EXISTS ${STAGING_FTS_TABLE};
    DROP TABLE IF EXISTS ${STAGING_CATALOG_FTS_TABLE};
    DROP TABLE IF EXISTS ${STAGING_TABLE};
    ${buildTableDdl(STAGING_TABLE)}
  `);

  const allColumns = [...INSERT_COLUMNS, "year_sort", ...NORM_COLUMNS];
  const rowPlaceholder = `(?, ${allColumns.map(() => "?").join(", ")})`;
  const insertSql = (n: number) =>
    `INSERT INTO ${STAGING_TABLE} (id, ${allColumns.join(", ")}) VALUES ${Array(n)
      .fill(rowPlaceholder)
      .join(", ")}`;

  // Insert without a single long-held interactive transaction: now that
  // parsing interleaves with the writes, a write transaction left open across
  // the (multi-second) parse gaps risks being timed out server-side by Turso.
  // Each batch is its own autocommit instead — safe because this only builds
  // the *staging* generation; the live swap in atomicSwap.ts is the part that
  // must be atomic, and a failed/partial build is simply dropped and rebuilt on
  // the next retry (buildStagingTablesWithRetry).
  let id = 0;
  let chunkArgs: (string | number | null)[] = [];
  let chunkCount = 0;
  let batch: { sql: string; args: (string | number | null)[] }[] = [];

  const sealChunk = () => {
    if (chunkCount === 0) return;
    batch.push({ sql: insertSql(chunkCount), args: chunkArgs });
    chunkArgs = [];
    chunkCount = 0;
  };
  const flushBatch = async () => {
    if (batch.length === 0) return;
    await client.batch(batch, "write");
    batch = [];
    // Yield a real event-loop tick between batches so the site stays
    // responsive during a big import (local SQLite bindings otherwise run the
    // whole import synchronously and starve incoming requests).
    await new Promise((resolve) => setImmediate(resolve));
  };
  const addRow = async (byField: FieldRow) => {
    id++;
    const { values, yearSort, norms } = insertPartsFor(byField);
    chunkArgs.push(id, ...values, yearSort, ...norms);
    chunkCount++;
    if (chunkCount >= CHUNK_SIZE) {
      sealChunk();
      if (batch.length >= CHUNKS_PER_BATCH) await flushBatch();
    }
  };

  // Progress is reported at each phase so a stuck import can be pinned to
  // parse+insert vs. FTS — both on screen (streamed to the browser) and in the
  // server logs. `nextReport` marks the row count at which to report again.
  const bt0 = Date.now();
  const secs = () => ((Date.now() - bt0) / 1000).toFixed(1);
  let nextReport = 10000;
  onProgress?.("Reading the file and saving records…");

  // The overlay-applied target rows (file rows + editor edits + editor-added
  // records) come from the shared generator so this and the diff importer build
  // the identical target catalogue.
  for await (const row of streamTargetRows(csvBuffer, onProgress)) {
    await addRow(row);
    if (id >= nextReport) {
      onProgress?.(`Saved ${id.toLocaleString()} records (${secs()}s)…`);
      nextReport += 10000;
    }
  }

  sealChunk();
  await flushBatch();

  // Now that all rows are in, build the secondary indexes in one pass each —
  // far faster than maintaining them on every insert, and it doesn't degrade
  // as the table grows (see buildIndexStatements). Each runs server-side on
  // Turso, so this is just a handful of round trips.
  onProgress?.(`All ${id.toLocaleString()} records saved (${secs()}s). Building sort indexes…`);
  for (const stmt of buildIndexStatements(STAGING_TABLE)) {
    await client.execute(stmt);
  }
  onProgress?.(`Sort indexes built (${secs()}s). Building the search index…`);

  // Populate both FTS indexes from the table we just filled, entirely
  // server-side — no need to transmit the text over the network a second time.
  await client.execute(
    `INSERT INTO ${STAGING_FTS_TABLE} (rowid, ${FTS_COLUMNS.join(", ")})
     SELECT id, ${FTS_COLUMNS.join(", ")} FROM ${STAGING_TABLE}`
  );
  onProgress?.(`Search index 1 of 2 built (${secs()}s)…`);
  const catalogFtsSourceExprs = CATALOG_FTS_COLUMNS.map((c) => CATALOG_FTS_SOURCE_EXPR[c]);
  await client.execute(
    `INSERT INTO ${STAGING_CATALOG_FTS_TABLE} (rowid, ${CATALOG_FTS_COLUMNS.join(", ")})
     SELECT id, ${catalogFtsSourceExprs.join(", ")} FROM ${STAGING_TABLE}`
  );
  onProgress?.(`Search index built (${secs()}s).`);

  return { rowCount: id };
}
