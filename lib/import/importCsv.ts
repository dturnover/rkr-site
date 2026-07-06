import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import { getClient } from "@/lib/db/client";
import { buildDdl, STAGING_TABLE, STAGING_FTS_TABLE } from "@/lib/db/ddl";

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

export interface ParsedRow {
  values: (string | null)[]; // aligned with INSERT_COLUMNS
  yearSort: number | null;
  norms: (string | null)[]; // aligned with NORM_COLUMNS
}

export function parseCsvBuffer(buffer: Buffer): ParsedRow[] {
  const text = iconv.decode(buffer, "win1252");
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
      const cells = CSV_FIELDS.map((_, i) => nullIfBlank(row[i]));
      const byField = Object.fromEntries(CSV_FIELDS.map((f, i) => [f, cells[i]]));
      const values = INSERT_COLUMNS.map((f) => byField[f]);
      const yearSort = deriveYearSort(byField.year);
      const norms = NORM_SOURCE_FIELDS.map((f) => {
        const v = byField[f];
        return v ? v.toLowerCase() : null; // already trimmed by nullIfBlank
      });
      return { values, yearSort, norms };
    });
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
  const rows = parseCsvBuffer(csvBuffer);
  const client = await getClient();

  await client.executeMultiple(`
    DROP TABLE IF EXISTS ${STAGING_FTS_TABLE};
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
        chunk.forEach((r, k) => {
          const id = j + k + 1;
          args.push(id, ...r.values, r.yearSort, ...r.norms);
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

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return { rowCount: rows.length };
}
