import { getClient } from "@/lib/db/client";
import {
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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// The simple search box matches title/artist/notes text (via FTS) *and*
// matrix/label catalog numbers (via LIKE) — collectors search by catalog
// number as often as by title (e.g. "search 1022, get 42 hits"), and FTS5's
// tokenizer doesn't reliably do substring matches inside codes like
// "WIPX1022".
//
// The catalog LIKE is a leading-wildcard substring match, which can never
// use a B-tree index — SQLite/Turso has to scan every row. Measured against
// the live 132k-row Turso database: a single-column substring scan costs
// ~5-10s, and (critically) `OR`-ing two such scans together costs ~10x that
// (~60s+) rather than ~2x — the query planner handles it very poorly. Two
// mitigations, both required to keep this affordable:
//  1. Only run the catalog scan at all when the query contains a digit —
//     real matrix/label numbers always do, and plain artist/title searches
//     (the common case) skip it entirely, paying zero extra cost.
//  2. When it does run, use UNION of two single-column scans instead of
//     OR — empirically ~6x faster for the same result on this database.
// FTS-sourced rows keep their bm25 relevance rank and are SQL-paginated
// (cheap regardless of match count, since it's index-backed); catalog
// matches are a small, fully-materialized JS list appended after all FTS
// pages are exhausted.
export async function keywordSearch(
  q: string,
  opts: { sort?: string; dir?: string; page?: number }
): Promise<{ rows: RecordListRow[]; total: number }> {
  const trimmed = q.trim();
  if (!trimmed) return { rows: [], total: 0 };

  const client = await getClient();
  const page = opts.page ?? 1;
  const useCustomSort = !!opts.sort;
  const { clause } = buildOrderClause(opts.sort, opts.dir);
  const cols = RESULT_COLUMNS.trim()
    .split(",")
    .map((c) => `r.${c.trim()}`)
    .join(", ");

  const ftsQuery = buildFtsQuery(q);
  const hasDigit = /\d/.test(trimmed);
  const likePattern = `%${escapeLike(trimmed)}%`;

  let catalogIds: number[] = [];
  if (hasDigit) {
    const catalogRes = await client.execute({
      sql: `SELECT id FROM records WHERE matrix_number LIKE ? ESCAPE '\\'
            UNION
            SELECT id FROM records WHERE label_number LIKE ? ESCAPE '\\'
            LIMIT 2000`,
      args: [likePattern, likePattern],
    });
    catalogIds = (catalogRes.rows as unknown as { id: number }[]).map((r) => Number(r.id));
  }

  let ftsTotal = 0;
  try {
    if (ftsQuery) {
      const ftsCountRes = await client.execute({
        sql: `SELECT COUNT(*) AS c FROM records_fts WHERE records_fts MATCH ?`,
        args: [ftsQuery],
      });
      ftsTotal = Number(ftsCountRes.rows[0]?.c ?? 0);
    }
  } catch {
    // Malformed FTS5 query syntax (rare edge cases in user input) — treat as no FTS matches.
    ftsTotal = 0;
  }

  const total = ftsTotal + catalogIds.length;
  if (total === 0) return { rows: [], total: 0 };

  if (useCustomSort) {
    // Custom column sort spans both sources — re-fetch the combined id set
    // in the requested SQL order. Both id lists are already small/bounded.
    const allIds = new Set<number>(catalogIds);
    if (ftsQuery) {
      try {
        const ftsIdsRes = await client.execute({
          sql: `SELECT rowid AS id FROM records_fts WHERE records_fts MATCH ? LIMIT 2000`,
          args: [ftsQuery],
        });
        for (const r of ftsIdsRes.rows as unknown as { id: number }[]) allIds.add(Number(r.id));
      } catch {
        // ignore — already counted above
      }
    }
    const idList = [...allIds];
    if (idList.length === 0) return { rows: [], total };
    const placeholders = idList.map(() => "?").join(",");
    const rowsRes = await client.execute({
      sql: `SELECT ${cols} FROM records r WHERE r.id IN (${placeholders}) ${clause} LIMIT ? OFFSET ?`,
      args: [...idList, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    });
    return { rows: rowsRes.rows as unknown as RecordListRow[], total };
  }

  // Default order: FTS relevance first (SQL-paginated), then catalog
  // matches appended once FTS pages are exhausted.
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

const NORM_LIKE_FIELDS: Record<
  keyof AdvancedSearchFields,
  { column: string; norm: boolean } | undefined
> = {
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

export function hasAnyField(fields: AdvancedSearchFields): boolean {
  return Object.values(fields).some((v) => v && v.trim() !== "");
}

export async function advancedSearch(
  fields: AdvancedSearchFields,
  opts: { sort?: string; dir?: string; page?: number }
): Promise<{ rows: RecordListRow[]; total: number }> {
  const client = await getClient();
  const page = opts.page ?? 1;
  const { clause } = buildOrderClause(opts.sort, opts.dir);

  const wheres: string[] = [];
  const args: (string | number)[] = [];

  for (const [key, def] of Object.entries(NORM_LIKE_FIELDS) as [
    keyof AdvancedSearchFields,
    { column: string; norm: boolean }
  ][]) {
    const raw = fields[key];
    if (!raw || raw.trim() === "") continue;
    const value = raw.trim();
    wheres.push(`${def.column} LIKE ? ESCAPE '\\'`);
    const escaped = value.replace(/[\\%_]/g, (m) => `\\${m}`);
    args.push(`%${def.norm ? escaped.toLowerCase() : escaped}%`);
  }

  if (wheres.length === 0) return { rows: [], total: 0 };

  const whereClause = wheres.join(" AND ");

  const totalRes = await client.execute({
    sql: `SELECT COUNT(*) AS c FROM records WHERE ${whereClause}`,
    args,
  });
  const total = Number(totalRes.rows[0]?.c ?? 0);

  const rowsRes = await client.execute({
    sql: `SELECT ${RESULT_COLUMNS} FROM records WHERE ${whereClause} ${clause} LIMIT ? OFFSET ?`,
    args: [...args, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  });

  return { rows: rowsRes.rows as unknown as RecordListRow[], total };
}
