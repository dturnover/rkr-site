import { getClient } from "@/lib/db/client";
import { FACETS, type FacetSlug } from "@/lib/facetConfig";
import {
  PAGE_SIZE,
  RESULT_COLUMNS,
  buildOrderClause,
  type RecordListRow,
} from "./shared";

export interface FacetIndexEntry {
  value: string; // used in the URL, already encodeURIComponent-safe raw string
  label: string; // human-displayed representative value
  count: number;
}

const UNKNOWN_VALUE = "__unknown__";

export async function getFacetIndex(slug: FacetSlug): Promise<FacetIndexEntry[]> {
  const facet = FACETS[slug];
  const client = await getClient();

  const known = await client.execute(
    `SELECT ${facet.column} AS value, ${facet.displayColumn} AS label, COUNT(*) AS count
     FROM records
     WHERE ${facet.column} IS NOT NULL
     GROUP BY ${facet.column}
     ORDER BY ${facet.sortMode === "numeric" ? "value" : "value COLLATE NOCASE"} ASC`
  );

  const entries: FacetIndexEntry[] = known.rows.map((r) => ({
    value: String(r.value),
    label: String(r.label ?? r.value),
    count: Number(r.count),
  }));

  const unknownCount = await client.execute(
    `SELECT COUNT(*) AS count FROM records WHERE ${facet.column} IS NULL`
  );
  const uc = Number(unknownCount.rows[0]?.count ?? 0);
  if (uc > 0) {
    entries.push({ value: UNKNOWN_VALUE, label: "Unknown", count: uc });
  }

  return entries;
}

export async function getFacetValueRows(
  slug: FacetSlug,
  value: string,
  opts: { sort?: string; dir?: string; page?: number }
): Promise<{ rows: RecordListRow[]; total: number; label: string }> {
  const facet = FACETS[slug];
  const client = await getClient();
  const page = opts.page ?? 1;

  const whereClause =
    value === UNKNOWN_VALUE ? `${facet.column} IS NULL` : `${facet.column} = ?`;
  const args = value === UNKNOWN_VALUE ? [] : [value];

  const totalRes = await client.execute({
    sql: `SELECT COUNT(*) AS c FROM records WHERE ${whereClause}`,
    args,
  });
  const total = Number(totalRes.rows[0]?.c ?? 0);
  const { clause } = buildOrderClause(opts.sort, opts.dir, total);

  const rowsRes = await client.execute({
    sql: `SELECT ${RESULT_COLUMNS} FROM records WHERE ${whereClause} ${clause} LIMIT ? OFFSET ?`,
    args: [...args, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  });

  let label = value === UNKNOWN_VALUE ? "Unknown" : value;
  if (value !== UNKNOWN_VALUE && rowsRes.rows[0]) {
    label = String((rowsRes.rows[0] as unknown as RecordListRow)[facet.displayColumn as keyof RecordListRow] ?? value);
  } else if (value !== UNKNOWN_VALUE) {
    const labelRes = await client.execute({
      sql: `SELECT ${facet.displayColumn} AS label FROM records WHERE ${whereClause} LIMIT 1`,
      args,
    });
    label = String(labelRes.rows[0]?.label ?? value);
  }

  return { rows: rowsRes.rows as unknown as RecordListRow[], total, label };
}

export { UNKNOWN_VALUE };
