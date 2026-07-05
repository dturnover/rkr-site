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

export async function keywordSearch(
  q: string,
  opts: { sort?: string; dir?: string; page?: number }
): Promise<{ rows: RecordListRow[]; total: number }> {
  const ftsQuery = buildFtsQuery(q);
  if (!ftsQuery) return { rows: [], total: 0 };

  const client = await getClient();
  const page = opts.page ?? 1;
  const useCustomSort = !!opts.sort;
  const { clause } = buildOrderClause(opts.sort, opts.dir);
  const orderClause = useCustomSort ? clause : "ORDER BY bm25(records_fts)";

  const cols = RESULT_COLUMNS.trim()
    .split(",")
    .map((c) => `r.${c.trim()}`)
    .join(", ");

  let total = 0;
  let rows: RecordListRow[] = [];
  try {
    const totalRes = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM records_fts WHERE records_fts MATCH ?`,
      args: [ftsQuery],
    });
    total = Number(totalRes.rows[0]?.c ?? 0);

    const rowsRes = await client.execute({
      sql: `SELECT ${cols} FROM records_fts
            JOIN records r ON r.id = records_fts.rowid
            WHERE records_fts MATCH ?
            ${orderClause}
            LIMIT ? OFFSET ?`,
      args: [ftsQuery, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    });
    rows = rowsRes.rows as unknown as RecordListRow[];
  } catch {
    // Malformed FTS5 query syntax (rare edge cases in user input) — treat as no results.
    return { rows: [], total: 0 };
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
