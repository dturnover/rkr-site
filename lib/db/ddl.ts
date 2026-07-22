import crypto from "node:crypto";

// DDL for one "generation" of the records table, parameterized by table
// name so the importer can build a fresh generation as `records_new`
// alongside the live `records` table, then have the swap rename tables
// into place (see lib/import/atomicSwap.ts).
//
// Index names get a random per-build suffix rather than being derived from
// `tableName` alone: `ALTER TABLE ... RENAME TO` (used by the swap) renames
// a table but does NOT rename its indexes, so after a few swap cycles the
// live `records` table ends up carrying indexes still literally named
// `idx_records_new_*` from whichever import first created them. Since
// `buildStagingTables` always builds into a table literally called
// `records_new` again next time, index names tied only to that fixed name
// would collide with the previous generation's now-differently-placed
// indexes (confirmed by hitting exactly this "index already exists" error
// on a second import during testing) — SQLite indexes share one global
// namespace, unlike tables, which aren't scoped per "slot" here either.
//
// The FTS5 table is intentionally standalone (no `content=`/`content_rowid=`
// external-content link) rather than the more common pattern paired with an
// 'INSERT INTO x(x) VALUES(\'rebuild\')' rebuild step. That pairing is
// convenient but ties the FTS index to its content table by name at create
// time; renaming both tables (as the swap does) leaves that internal
// reference dangling and MATCH queries start failing — confirmed by testing
// against the actual libSQL build in use before committing to this design.
// A standalone FTS5 table has no such link: we explicitly control `rowid`
// on insert to match the main table's `id`, so the `JOIN ... ON r.id =
// records_fts.rowid` pattern in lib/queries/search.ts still works, and the
// table survives being renamed indefinitely.
//
// The `_norm` columns are plain TEXT, not `GENERATED ALWAYS AS (...)
// STORED`. They were originally computed columns, but against a real
// remote Turso database a full import (132k rows) reliably exceeded even a
// 300-second Vercel function budget, while a comparable bulk operation
// with no per-row expression to evaluate (the FTS INSERT...SELECT below)
// took under a minute — strong evidence the per-row `lower(trim(...))`
// expression evaluation for 8 columns, 132k times, was the actual
// bottleneck rather than network transfer (confirmed by testing against
// the live database). Computing the same values in JavaScript during
// import (lib/import/importCsv.ts) and inserting them as plain values
// moves that cost off Turso's write path entirely — the values, indexes,
// and every query against them are identical either way.
// Columns available to advancedSearch()'s per-field lookup (lib/queries/search.ts).
// All substring search — no leading-anchor requirement, matching the old
// LIKE '%value%' semantics exactly, but backed by an index this time.
export const CATALOG_FTS_COLUMNS = [
  "artist",
  "title",
  "label",
  "label_number",
  "matrix_number",
  "producer",
  "country",
  "format",
  "year",
  "genre",
  "riddim",
  "origin",
  "notes",
  // B-side fields. Every record can carry a whole second song on its flip
  // side (the b_side_* columns on `records`), and the detail page shows it,
  // but none of it was indexed here — so a B-side artist, title, or catalogue
  // number was completely invisible to search (a reported bug). Indexing them
  // in the same trigram table makes them findable from the keyword box (which
  // ORs across every column here) and from the matching Advanced Search
  // fields (see CATALOG_FIELD_COLUMN in lib/queries/search.ts).
  "b_side_artist",
  "b_side_artist_credit",
  "b_side_title",
  "b_side_title_credit",
  "b_side_matrix_number",
  "b_side_label_number",
] as const;

export function buildDdl(tableName: string): string {
  const fts = `${tableName}_fts`;
  const catalogFts = `${tableName}_catalog_fts`;
  const uid = crypto.randomBytes(4).toString("hex");
  const idx = (name: string) => `idx_${tableName}_${name}_${uid}`;
  return `
CREATE TABLE ${tableName} (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  artist                TEXT,
  artist_credit         TEXT,
  title                 TEXT,
  title_credit          TEXT,
  matrix_number         TEXT,
  label_number          TEXT,
  label                 TEXT,
  country               TEXT,
  format                TEXT,
  producer              TEXT,
  year                  TEXT,
  year_sort             INTEGER,
  riddim                TEXT,
  version               TEXT,
  b_side_artist         TEXT,
  b_side_artist_credit  TEXT,
  b_side_title          TEXT,
  b_side_title_credit   TEXT,
  b_side_matrix_number  TEXT,
  b_side_label_number   TEXT,
  song_origin           TEXT,
  notes                 TEXT,
  genre                 TEXT,
  additions             TEXT,
  artist_norm   TEXT,
  label_norm    TEXT,
  producer_norm TEXT,
  riddim_norm   TEXT,
  country_norm  TEXT,
  origin_norm   TEXT,
  genre_norm    TEXT,
  format_norm   TEXT
);

CREATE INDEX ${idx("artist_norm")}   ON ${tableName}(artist_norm);
CREATE INDEX ${idx("label_norm")}    ON ${tableName}(label_norm);
CREATE INDEX ${idx("producer_norm")} ON ${tableName}(producer_norm);
CREATE INDEX ${idx("riddim_norm")}   ON ${tableName}(riddim_norm);
CREATE INDEX ${idx("country_norm")}  ON ${tableName}(country_norm);
CREATE INDEX ${idx("origin_norm")}   ON ${tableName}(origin_norm);
CREATE INDEX ${idx("genre_norm")}    ON ${tableName}(genre_norm);
CREATE INDEX ${idx("format_norm")}   ON ${tableName}(format_norm);
CREATE INDEX ${idx("year_sort")}     ON ${tableName}(year_sort);
CREATE INDEX ${idx("matrix_number")} ON ${tableName}(matrix_number);
CREATE INDEX ${idx("label_number")}  ON ${tableName}(label_number);

CREATE VIRTUAL TABLE ${fts} USING fts5(title, title_credit, artist, artist_credit, notes);

-- Advanced Search's per-field lookups used to be a plain 'LIKE %value%' on
-- each column, which can never use a B-tree index (leading wildcard) and
-- forces a full table scan — measured at 40-100+ seconds per query on the
-- live 132k-row Turso database (confirmed by testing). The trigram
-- tokenizer indexes every 3-character substring of each column, so a MATCH
-- query can find "marley" inside "bob marley" (or "1022" inside
-- "WIPX1022-A") via the index instead of scanning every row. Standalone
-- (no content= link) for the same reason as ${fts} above: renaming it
-- (as the swap does) would otherwise leave a dangling internal reference.
-- All columns are inserted lowercased (either already-lowercase _norm
-- values or lower()'d raw text) so matching is case-insensitive without
-- depending on the tokenizer's own case-folding defaults.
CREATE VIRTUAL TABLE ${catalogFts} USING fts5(${CATALOG_FTS_COLUMNS.join(", ")}, tokenize='trigram');
`;
}

export const LIVE_TABLE = "records";
export const LIVE_FTS_TABLE = "records_fts";
export const LIVE_CATALOG_FTS_TABLE = "records_catalog_fts";
export const STAGING_TABLE = "records_new";
export const STAGING_FTS_TABLE = "records_new_fts";
export const STAGING_CATALOG_FTS_TABLE = "records_new_catalog_fts";
export const PREVIOUS_TABLE = "records_previous";
export const PREVIOUS_FTS_TABLE = "records_previous_fts";
export const PREVIOUS_CATALOG_FTS_TABLE = "records_previous_catalog_fts";
