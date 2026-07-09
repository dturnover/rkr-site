import { getClient } from "@/lib/db/client";
import {
  ALPHA_SORT_THRESHOLD,
  PAGE_SIZE,
  RESULT_COLUMNS,
  buildOrderClause,
  type RecordListRow,
} from "./shared";

function buildFtsQuery(q: string): string | null {
  const tokens = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .map((t) => t.replace(/["*]/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(" ");
}

// FTS5 string-literal quoting: wrap a term in double quotes, doubling any
// internal double quotes. Needed because MATCH strings are themselves a
// small query language — an unquoted term containing an apostrophe or
// reserved word (e.g. "AND", "NOT") would otherwise throw a syntax error or
// be misinterpreted, rather than being searched for literally (confirmed by
// testing). Safe for the trigram tokenizer too: a quoted phrase is matched
// as a literal run of trigrams, which is exactly the substring-match
// behavior LIKE '%term%' used to provide.
function ftsQuoteTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

// The simple search box matches title/artist/notes text (via the existing
// word-tokenized records_fts) *and* matrix/label catalog numbers (via
// records_catalog_fts, a trigram-tokenized index over the raw code columns
// — see lib/db/ddl.ts) — collectors search by catalog number as often as by
// title (e.g. "search 1022, get 42 hits"), and records_fts's tokenizer
// doesn't reliably do substring matches inside codes like "WIPX1022".
//
// The catalog lookup is index-backed but not uniformly cheap: a multi-word
// *phrase* match against the trigram index (e.g. "alton ellis", two words)
// measured at 1.5-3.5s on the live database, versus low hundreds of ms for
// a single short token like "1022" — the cost scales with how many
// consecutive trigram positions have to be verified, not just whether an
// index exists. Real matrix/label numbers are always either a single
// token ("WIPX1022") or contain a digit ("WIRL BE 1022-2") — a multi-word,
// all-alphabetic query (an artist or title search, the common case) is
// never a catalog code, so it skips this check entirely rather than pay a
// multi-second tax on every plain-text search. One separate known gap: the
// trigram tokenizer can't match terms under 3 characters (see
// MIN_TRIGRAM_LENGTH below), so a 1-2 character keyword search won't
// surface catalog-number matches either — accepted here since real
// matrix/label numbers are essentially never that short; advancedSearch has
// an exact-match fallback for the one field where short terms are actually
// common (2-letter country codes).
export async function keywordSearch(
  q: string,
  opts: { sort?: string; dir?: string; page?: number }
): Promise<{ rows: RecordListRow[]; total: number }> {
  const trimmed = q.trim();
  if (!trimmed) return { rows: [], total: 0 };

  const client = await getClient();
  const page = opts.page ?? 1;
  const cols = RESULT_COLUMNS.trim()
    .split(",")
    .map((c) => `r.${c.trim()}`)
    .join(", ");

  const ftsQuery = buildFtsQuery(q);
  const looksLikeCatalogCode = /\d/.test(trimmed) || !/\s/.test(trimmed);

  let catalogIds: number[] = [];
  if (looksLikeCatalogCode) {
    const quotedTerm = ftsQuoteTerm(trimmed.toLowerCase());
    const catalogQuery = `matrix_number:${quotedTerm} OR label_number:${quotedTerm}`;
    try {
      const catalogRes = await client.execute({
        sql: `SELECT rowid AS id FROM records_catalog_fts WHERE records_catalog_fts MATCH ?`,
        args: [catalogQuery],
      });
      catalogIds = (catalogRes.rows as unknown as { id: number }[]).map((r) => Number(r.id));
    } catch {
      // Trigram tokenizer can't form any trigram from a 1-2 character term —
      // no match, not an error, but guard anyway for genuinely malformed input.
      catalogIds = [];
    }
  }

  // Fetch up to one more than the sort threshold in a single round trip: if
  // that comes back under the cap, its length *is* the exact total (no
  // separate COUNT needed — the common case, one query instead of two). If
  // it hits the cap, the result is too large to sort anyway (see below), so
  // only then is a real COUNT worth its own round trip.
  let ftsIds: number[] = [];
  let ftsTotal = 0;
  if (ftsQuery) {
    try {
      const ftsIdsRes = await client.execute({
        sql: `SELECT rowid AS id FROM records_fts WHERE records_fts MATCH ? LIMIT ?`,
        args: [ftsQuery, ALPHA_SORT_THRESHOLD + 1],
      });
      ftsIds = (ftsIdsRes.rows as unknown as { id: number }[]).map((r) => Number(r.id));
      if (ftsIds.length <= ALPHA_SORT_THRESHOLD) {
        ftsTotal = ftsIds.length;
      } else {
        const ftsCountRes = await client.execute({
          sql: `SELECT COUNT(*) AS c FROM records_fts WHERE records_fts MATCH ?`,
          args: [ftsQuery],
        });
        ftsTotal = Number(ftsCountRes.rows[0]?.c ?? 0);
        ftsIds = []; // capped/partial — not usable below, and not needed by the fallback path
      }
    } catch {
      // Malformed FTS5 query syntax (rare edge cases in user input) — treat as no FTS matches.
      ftsTotal = 0;
    }
  }

  const total = ftsTotal + catalogIds.length;
  if (total === 0) return { rows: [], total: 0 };

  // Small enough to sort properly — either the column the user explicitly
  // asked for, or (by default) alphabetically by artist, matching how a
  // physical discography is browsed. This used to always default to raw
  // relevance order, which — for a search like "Alton Ellis" that matches
  // hundreds of tracks — visibly showed the first page or so in one order
  // (bm25 relevance) and later pages suddenly alphabetical once past the
  // FTS results and into the id-ordered catalog-match tail (confirmed by
  // testing). Materializing the combined id set and sorting it properly
  // fixes that; both id lists here are already small/bounded.
  if (opts.sort || total <= ALPHA_SORT_THRESHOLD) {
    const { clause } = buildOrderClause(opts.sort, opts.dir, total);
    const idList = [...new Set<number>([...catalogIds, ...ftsIds])];
    if (idList.length === 0) return { rows: [], total };
    const placeholders = idList.map(() => "?").join(",");
    const rowsRes = await client.execute({
      sql: `SELECT ${cols} FROM records r WHERE r.id IN (${placeholders}) ${clause} LIMIT ? OFFSET ?`,
      args: [...idList, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    });
    return { rows: rowsRes.rows as unknown as RecordListRow[], total };
  }

  // Large result, no explicit sort requested (e.g. a very common word):
  // sorting all of it isn't worth the cost, so fall back to FTS relevance
  // order, which stays cheap regardless of match count (SQL-paginated,
  // index-backed), then catalog matches appended once FTS pages are
  // exhausted.
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const rows: RecordListRow[] = [];

  if (ftsQuery && pageStart < ftsTotal) {
    const ftsLimit = Math.min(PAGE_SIZE, ftsTotal - pageStart);
    const ftsRowsRes = await client.execute({
      sql: `SELECT ${cols} FROM records_fts f
            JOIN records r ON r.id = f.rowid
            WHERE f.records_fts MATCH ?
            ORDER BY bm25(records_fts) ASC
            LIMIT ? OFFSET ?`,
      args: [ftsQuery, ftsLimit, pageStart],
    });
    rows.push(...(ftsRowsRes.rows as unknown as RecordListRow[]));
  }

  if (pageEnd > ftsTotal && catalogIds.length > 0) {
    const catalogPageIds = catalogIds.slice(
      Math.max(0, pageStart - ftsTotal),
      Math.max(0, pageEnd - ftsTotal)
    );
    if (catalogPageIds.length > 0) {
      const placeholders = catalogPageIds.map(() => "?").join(",");
      const catalogRowsRes = await client.execute({
        sql: `SELECT ${cols} FROM records r WHERE r.id IN (${placeholders})`,
        args: catalogPageIds,
      });
      const byId = new Map(
        (catalogRowsRes.rows as unknown as RecordListRow[]).map((r) => [r.id, r])
      );
      for (const id of catalogPageIds) {
        const row = byId.get(id);
        if (row) rows.push(row);
      }
    }
  }

  return { rows, total };
}

export interface AdvancedSearchFields {
  artist?: string;
  title?: string;
  label?: string;
  labelNumber?: string;
  matrixNumber?: string;
  producer?: string;
  country?: string;
  format?: string;
  year?: string;
  genre?: string;
  riddim?: string;
  origin?: string;
  notes?: string;
}

// Maps each advanced-search field to its column in records_catalog_fts
// (lib/db/ddl.ts) — every field here used to be a `column LIKE '%value%'`
// full-table scan, measured at 40-100+ seconds per query on the live
// database (no B-tree index can serve a leading-wildcard substring match).
// records_catalog_fts is trigram-tokenized, so the same substring semantics
// are now served from an actual index.
const CATALOG_FIELD_COLUMN: Record<keyof AdvancedSearchFields, string> = {
  artist: "artist",
  title: "title",
  label: "label",
  labelNumber: "label_number",
  matrixNumber: "matrix_number",
  producer: "producer",
  country: "country",
  format: "format",
  year: "year",
  genre: "genre",
  riddim: "riddim",
  origin: "origin",
  notes: "notes",
};

// Fallback for terms shorter than a trigram (below): the equivalent lookup
// against `records` directly, using each field's existing indexed _norm
// column where one exists (exact match, not substring — but a "substring"
// search on 1-2 characters is nearly meaningless anyway, and this is both
// correct and fast, unlike the LIKE scan it replaces).
const EXACT_FIELD_COLUMN: Record<keyof AdvancedSearchFields, { column: string; norm: boolean }> = {
  artist: { column: "artist_norm", norm: true },
  title: { column: "title", norm: false },
  label: { column: "label_norm", norm: true },
  labelNumber: { column: "label_number", norm: false },
  matrixNumber: { column: "matrix_number", norm: false },
  producer: { column: "producer_norm", norm: true },
  country: { column: "country_norm", norm: true },
  format: { column: "format_norm", norm: true },
  year: { column: "year", norm: false },
  genre: { column: "genre_norm", norm: true },
  riddim: { column: "riddim_norm", norm: true },
  origin: { column: "origin_norm", norm: true },
  notes: { column: "notes", norm: false },
};

// The trigram tokenizer can't form a single trigram from fewer than 3
// characters, so a MATCH query for a shorter term silently returns zero
// rows — not an error, just wrong (confirmed by testing: country="ja"
// matched nothing, despite ~70k JA records existing). This isn't an edge
// case here specifically: two-letter country codes (JA, UK, US) are the
// standard format for that field.
const MIN_TRIGRAM_LENGTH = 3;

export function hasAnyField(fields: AdvancedSearchFields): boolean {
  return Object.values(fields).some((v) => v && v.trim() !== "");
}

export async function advancedSearch(
  fields: AdvancedSearchFields,
  opts: { sort?: string; dir?: string; page?: number }
): Promise<{ rows: RecordListRow[]; total: number }> {
  const client = await getClient();
  const page = opts.page ?? 1;

  const matchParts: string[] = [];
  const exactWheres: string[] = [];
  const exactArgs: string[] = [];

  for (const [key, column] of Object.entries(CATALOG_FIELD_COLUMN) as [
    keyof AdvancedSearchFields,
    string
  ][]) {
    const raw = fields[key];
    if (!raw || raw.trim() === "") continue;
    const value = raw.trim();
    if (value.length < MIN_TRIGRAM_LENGTH) {
      const exact = EXACT_FIELD_COLUMN[key];
      exactWheres.push(`r.${exact.column} = ?`);
      exactArgs.push(exact.norm ? value.toLowerCase() : value);
    } else {
      matchParts.push(`${column}:${ftsQuoteTerm(value.toLowerCase())}`);
    }
  }

  if (matchParts.length === 0 && exactWheres.length === 0) return { rows: [], total: 0 };

  const cols = RESULT_COLUMNS.trim()
    .split(",")
    .map((c) => `r.${c.trim()}`)
    .join(", ");

  try {
    if (matchParts.length === 0) {
      // Every field was a short-term exact match — no FTS table involved.
      const whereClause = exactWheres.join(" AND ");
      const totalRes = await client.execute({
        sql: `SELECT COUNT(*) AS c FROM records r WHERE ${whereClause}`,
        args: exactArgs,
      });
      const total = Number(totalRes.rows[0]?.c ?? 0);
      if (total === 0) return { rows: [], total: 0 };
      const { clause } = buildOrderClause(opts.sort, opts.dir, total);

      const rowsRes = await client.execute({
        sql: `SELECT ${cols} FROM records r WHERE ${whereClause} ${clause} LIMIT ? OFFSET ?`,
        args: [...exactArgs, PAGE_SIZE, (page - 1) * PAGE_SIZE],
      });
      return { rows: rowsRes.rows as unknown as RecordListRow[], total };
    }

    const matchQuery = matchParts.join(" AND ");
    const extraWhere = exactWheres.length > 0 ? ` AND ${exactWheres.join(" AND ")}` : "";

    // CROSS JOIN, not a plain JOIN: with an extra exact-match condition on
    // `r` (e.g. country="ja"), SQLite's planner chose to drive the query
    // from r's country_norm index — probing the FTS virtual table once per
    // *country* match (up to ~70k probes) instead of once per *FTS* match
    // (as few as a few thousand) — 8+ seconds instead of single-digit
    // milliseconds for the exact same result (confirmed by testing). CROSS
    // JOIN is SQLite's documented way to pin the join order to what's
    // written, forcing the small, index-backed FTS match to drive.
    const totalRes = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM records_catalog_fts f
            CROSS JOIN records r ON r.id = f.rowid
            WHERE f.records_catalog_fts MATCH ?${extraWhere}`,
      args: [matchQuery, ...exactArgs],
    });
    const total = Number(totalRes.rows[0]?.c ?? 0);
    if (total === 0) return { rows: [], total: 0 };
    const { clause } = buildOrderClause(opts.sort, opts.dir, total);

    const rowsRes = await client.execute({
      sql: `SELECT ${cols} FROM records_catalog_fts f
            CROSS JOIN records r ON r.id = f.rowid
            WHERE f.records_catalog_fts MATCH ?${extraWhere}
            ${clause}
            LIMIT ? OFFSET ?`,
      args: [matchQuery, ...exactArgs, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    });

    return { rows: rowsRes.rows as unknown as RecordListRow[], total };
  } catch {
    return { rows: [], total: 0 };
  }
}
