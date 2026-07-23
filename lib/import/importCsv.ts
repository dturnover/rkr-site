import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { getClient } from "@/lib/db/client";
import {
  buildDdl,
  CATALOG_FTS_COLUMNS,
  STAGING_TABLE,
  STAGING_FTS_TABLE,
  STAGING_CATALOG_FTS_TABLE,
} from "@/lib/db/ddl";
import { computeRecordKey, EDITABLE_FIELDS, getOverlayForMerge } from "@/lib/editor/overlay";

// Exact column order of the RKR.csv export. `blank1` is a genuinely empty
// spacer column in the source file and is intentionally dropped; every other
// name here becomes a `records` column of the same name. Any columns beyond
// index 23 (the "Unnamed: 24-28" trailing junk columns pandas reports) are
// never read, by construction, since we only ever index into this array.
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
  "blank1",
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

const INSERT_COLUMNS = CSV_FIELDS.filter((f) => f !== "blank1");
const FTS_COLUMNS = ["title", "title_credit", "artist", "artist_credit", "notes"] as const;

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
// buildDdl in lib/db/ddl.ts for why (Turso's per-row expression evaluation
// cost was the dominant bottleneck in a full import, confirmed by testing).
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

export function parseCsvBuffer(buffer: Buffer): FieldRow[] {
  const text = decodeUpload(buffer);
  const rows: string[][] = parse(text, {
    columns: false,
    from_line: 2, // skip header row
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });

  return rows
    .filter((row) => row.some((cell) => cell && cell.trim() !== "")) // drop fully blank lines
    .map((row) => {
      const byField: FieldRow = {};
      CSV_FIELDS.forEach((f, i) => {
        byField[f] = nullIfBlank(row[i]);
      });
      return byField;
    });
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

// Re-applies the editor overlay onto the freshly-parsed CSV rows (Phase 3),
// in memory, before anything is inserted — so the search index is built once
// from the final merged data and the live records table needs no extra column.
//
// The conflict rule (per the site owner): dad's uploaded file wins for
// anything it actually contains; an editor's value only lands where dad's
// field is blank. Editor-added records that aren't in dad's file at all are
// appended; if dad's new file now contains a record with the same identity,
// dad's version wins and the editor copy is dropped (it's been "adopted").
//
// Records are matched by computeRecordKey (matrix number, else label no +
// artist + title) — see lib/editor/overlay.ts.
async function mergeOverlay(rows: FieldRow[]): Promise<FieldRow[]> {
  const { fieldEdits, editorRecords } = await getOverlayForMerge();
  if (fieldEdits.length === 0 && editorRecords.length === 0) return rows;

  const byKey = new Map<string, FieldRow[]>();
  for (const row of rows) {
    const key = computeRecordKey(row);
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const editable = new Set<string>(EDITABLE_FIELDS);
  for (const e of fieldEdits) {
    if (e.value == null || !editable.has(e.field)) continue;
    const targets = byKey.get(e.record_key);
    if (!targets) continue; // dad's file has no such record; nothing to attach to
    for (const row of targets) {
      // Fill only where dad's field is blank — his non-empty value wins.
      if (nullIfBlank(row[e.field]) == null) row[e.field] = e.value;
    }
  }

  for (const er of editorRecords) {
    if (byKey.has(er.record_key)) continue; // dad's file now has it — his version wins
    const row: FieldRow = {};
    for (const f of CSV_FIELDS) row[f] = null;
    for (const f of EDITABLE_FIELDS) row[f] = nullIfBlank(er.data[f] ?? null);
    rows.push(row);
  }

  return rows;
}

const CHUNK_SIZE = 500;
// Grouping several chunks into one tx.batch() call turns that many
// round trips into one. Against a remote Turso database, many small
// sequential round trips were both slow and fragile — a single transient
// timeout on any one of them failed the whole import (confirmed by
// testing against a real Turso database). Batching cuts the round-trip
// count by this factor.
const CHUNKS_PER_BATCH = 10;

/** Builds a fresh "staging" generation of the data (records_new /
 * records_new_fts) from a CSV buffer, inside the database the app is
 * already connected to (local file or Turso — same code either way). Does
 * not touch the live `records` table; the caller (atomicSwap.ts) is
 * responsible for swapping the staging tables into place. Ids are assigned
 * explicitly (not via AUTOINCREMENT) so the same id can be used later to
 * populate the FTS table by id, not transmitted a second time. */
export async function buildStagingTables(csvBuffer: Buffer): Promise<{ rowCount: number }> {
  // Parse dad's file, then re-apply the editor overlay on top (fills blanks,
  // appends editor-added records) — see mergeOverlay. On a database with no
  // editor activity this is a no-op and the import is unchanged.
  const rows = await mergeOverlay(parseCsvBuffer(csvBuffer));
  const client = await getClient();

  await client.executeMultiple(`
    DROP TABLE IF EXISTS ${STAGING_FTS_TABLE};
    DROP TABLE IF EXISTS ${STAGING_CATALOG_FTS_TABLE};
    DROP TABLE IF EXISTS ${STAGING_TABLE};
    ${buildDdl(STAGING_TABLE)}
  `);

  const allColumns = [...INSERT_COLUMNS, "year_sort", ...NORM_COLUMNS];
  const insertSql = (n: number) =>
    `INSERT INTO ${STAGING_TABLE} (id, ${allColumns.join(", ")}) VALUES ${Array(n)
      .fill(`(?, ${allColumns.map(() => "?").join(", ")})`)
      .join(", ")}`;

  const tx = await client.transaction("write");
  try {
    for (let i = 0; i < rows.length; i += CHUNK_SIZE * CHUNKS_PER_BATCH) {
      const statements: { sql: string; args: (string | number | null)[] }[] = [];

      for (
        let j = i;
        j < Math.min(i + CHUNK_SIZE * CHUNKS_PER_BATCH, rows.length);
        j += CHUNK_SIZE
      ) {
        const chunk = rows.slice(j, j + CHUNK_SIZE);
        const n = chunk.length;

        const args: (string | number | null)[] = [];
        chunk.forEach((byField, k) => {
          const id = j + k + 1;
          const { values, yearSort, norms } = insertPartsFor(byField);
          args.push(id, ...values, yearSort, ...norms);
        });

        statements.push({ sql: insertSql(n), args });
      }

      await tx.batch(statements);

      // Local SQLite bindings execute synchronously under the hood despite
      // the Promise-based API — with no true I/O wait, a long chain of
      // awaited calls never yields back to Node's event loop, so incoming
      // requests queue up and the whole site hangs for the entire import
      // (confirmed by testing: ~9s of dead air on every other route while
      // an import ran). Yielding via setImmediate between batches forces a
      // real event-loop tick, so pending requests get serviced promptly.
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Populate the FTS index from the table we just filled, entirely
    // server-side — no need to transmit title/artist/notes text over the
    // network a second time.
    await tx.execute(
      `INSERT INTO ${STAGING_FTS_TABLE} (rowid, ${FTS_COLUMNS.join(", ")})
       SELECT id, ${FTS_COLUMNS.join(", ")} FROM ${STAGING_TABLE}`
    );

    const catalogFtsSourceExprs = CATALOG_FTS_COLUMNS.map((c) => CATALOG_FTS_SOURCE_EXPR[c]);
    await tx.execute(
      `INSERT INTO ${STAGING_CATALOG_FTS_TABLE} (rowid, ${CATALOG_FTS_COLUMNS.join(", ")})
       SELECT id, ${catalogFtsSourceExprs.join(", ")} FROM ${STAGING_TABLE}`
    );

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return { rowCount: rows.length };
}
