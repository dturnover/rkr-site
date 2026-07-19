import { getClient } from "@/lib/db/client";
import { CATALOG_FTS_COLUMNS } from "@/lib/db/ddl";
import {
  ALPHA_SORT_THRESHOLD,
  PAGE_SIZE,
  RESULT_COLUMNS,
  buildOrderClause,
  type RecordListRow,
} from "./shared";

// Builds a single adjacent-phrase FTS5 query (quoted as one unit, prefix
// wildcard on the trailing word only) rather than splitting the input into
// separate per-word prefix terms ANDed together. The latter was the
// original approach here, and it's wrong for anything but a single-word
// search: FTS5 ANDs space-separated terms by default WITHOUT requiring
// adjacency, so a two-word query like "will power" became `"will"*
// "power"*` — matching any row containing a word starting with "will"
// *and*, anywhere else, a word starting with "power". Confirmed by testing
// against the live database: that query matched "Power and Will" (reversed
// order), "His Power" (the "will" match was "Williams", the artist's
// surname — a false hit from the prefix wildcard on a 4-letter fragment),
// and four other unrelated titles — a real, reported bug, not a hypothetical
// one. Quoting the whole query as one phrase requires the words adjacent
// and in order, exactly like a plain-text search engine's phrase behavior,
// and is what a hyphenated query ("will-power") was already accidentally
// doing correctly, since a hyphen contains no whitespace to split on.
function buildFtsQuery(q: string): string | null {
  const cleaned = q
    .trim()
    .replace(/["*]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(" ");
  if (!cleaned) return null;
  return `${ftsQuoteTerm(cleaned)}*`;
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

// Normalizes the term used for the trigram catalog search so that a text
// query is punctuation-insensitive, while a catalog *code* is not.
//
// A trigram match is exact over the literal characters, punctuation
// included — so "will-power" (hyphen) and "will power" (space) were
// different searches: the hyphenated one additionally matched a label
// literally named "Will-Power Records", the spaced one didn't. A visitor
// reasonably expects those two to behave identically (records_fts already
// treats them the same, since its word tokenizer splits on the hyphen).
// So for a plain text query, collapse every run of non-alphanumerics to a
// single space, making hyphen and space equivalent.
//
// But that normalization must NOT apply to catalog numbers, where the
// punctuation is load-bearing: a matrix number is stored like "GP 1660-1
// TSL" and a collector searching "1660-1" needs the hyphen kept intact to
// trigram-match it. The presence of a digit is the tell — real
// catalog/label numbers contain digits, ordinary word searches don't — so
// digit-bearing queries pass through untouched.
function normalizeCatalogTerm(term: string): string {
  if (/\d/.test(term)) return term.toLowerCase();
  return term.replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

// The simple search box matches title/artist/notes text (via the existing
// word-tokenized records_fts) *and* every field records_catalog_fts covers —
// artist, title, label, label/matrix numbers, producer, country, format,
// year, genre, riddim, origin, notes (see CATALOG_FTS_COLUMNS in
// lib/db/ddl.ts) — a trigram-tokenized index over the raw values, giving
// substring matches records_fts's word tokenizer can't do reliably (e.g.
// inside a code like "WIPX1022").
//
// This used to check only matrix_number/label_number, and only for queries
// that "looked like" a catalog code (had a digit, or no whitespace) —
// gated that narrowly because an early version measured a *single* trigram
// column at 1.4-3.5s for a two-word phrase. Re-measured after fixing an
// unrelated OR-vs-AND planner issue: querying all 13 columns at once is
// consistently fast (validated directly against the live database: a
// single word across all columns ~100-300ms, a two-word phrase ~200-600ms,
// even a broad single word matching 57k+ rows ~1.3s) — cheap enough to
// always run, which is also what fixed a real reported bug: searching a
// label name like "tysonic" from the keyword box found nothing, because
// records_fts doesn't index the label field at all and the old catalog
// check didn't either (it only ever looked at catalog *numbers*, not
// names). One remaining known gap: the trigram tokenizer can't match terms
// under 3 characters (see MIN_TRIGRAM_LENGTH below), so a 1-2 character
// keyword search won't surface these matches — accepted here since
// advancedSearch has an exact-match fallback for the one field where short
// terms are actually common (2-letter country codes).
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

  let catalogIds: number[] = [];
  const catalogTerm = normalizeCatalogTerm(trimmed);
  const quotedTerm = ftsQuoteTerm(catalogTerm);
  const catalogQuery = CATALOG_FTS_COLUMNS.map((c) => `${c}:${quotedTerm}`).join(" OR ");
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

  // Upper bound, not exact: catalog_fts now covers the same fields
  // records_fts does (title, artist, notes) plus many more, so the two id
  // sets overlap far more than when the catalog check only ever looked at
  // matrix/label numbers — a title match now routinely shows up in both.
  // The branch below recomputes an exact, deduplicated total whenever it
  // actually materializes both full id sets (the common case); the
  // large-result fallback further down keeps this approximate value, a
  // known, accepted tradeoff for not having to materialize a huge id set
  // just to count it precisely.
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
    const idSet = new Set<number>(catalogIds);
    if (ftsQuery && ftsIds.length > 0) {
      for (const id of ftsIds) idSet.add(id);
    } else if (ftsQuery && ftsTotal > 0) {
      // ftsIds was cleared earlier (the FTS match alone exceeded the cap),
      // but an explicit sort was requested here regardless of size — need
      // the fuller id set now to sort/dedupe correctly, so re-fetch it,
      // bounded the same way.
      try {
        const res = await client.execute({
          sql: `SELECT rowid AS id FROM records_fts WHERE records_fts MATCH ? LIMIT ?`,
          args: [ftsQuery, ALPHA_SORT_THRESHOLD],
        });
        for (const r of res.rows as unknown as { id: number }[]) idSet.add(Number(r.id));
      } catch {
        // ignore — already reflected in ftsTotal
      }
    }
    const idList = [...idSet];
    const exactTotal = idList.length; // deduplicated — the real count, not the upper bound above
    if (idList.length === 0) return { rows: [], total: exactTotal };
    const placeholders = idList.map(() => "?").join(",");
    const rowsRes = await client.execute({
      sql: `SELECT ${cols} FROM records r WHERE r.id IN (${placeholders}) ${clause} LIMIT ? OFFSET ?`,
      args: [...idList, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    });
    return { rows: rowsRes.rows as unknown as RecordListRow[], total: exactTotal };
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
      // Skip any catalog id already shown among the FTS rows on this same
      // page — now that catalog_fts covers title/artist/notes too, a record
      // can legitimately match both sources and would otherwise appear
      // twice within one page.
      const seen = new Set(rows.map((r) => r.id));
      for (const id of catalogPageIds) {
        if (seen.has(id)) continue;
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
