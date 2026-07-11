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

/** The "#" bucket on alpha facet indexes: every value that doesn't start
 * with a-z (digits, punctuation), plus the Unknown (NULL) entry. */
export const HASH_LETTER = "#";

export function isValidLetter(value: string | undefined | null): value is string {
  return !!value && (value === HASH_LETTER || /^[a-z]$/.test(value));
}

/** Lists one letter's worth of an alphabetical facet index, the whole index
 * for numeric facets (years — a few hundred values at most), or the whole
 * index for alpha facets flagged `singlePage` (country, format, genre — a
 * naturally small, bounded taxonomy; see FacetDef in lib/facetConfig.ts).
 *
 * Large alpha facets (artist, label, producer, riddim, origin) are
 * letter-scoped for a reason worth keeping: listing ALL distinct values
 * meant a GROUP BY over every row plus a ~19k-item HTML page for artists —
 * measured at up to 18s on the live Turso database before a visitor saw
 * anything. One letter is an index range-scan (`>= 'b' AND < 'c'` —
 * deliberately not `LIKE 'b%'`, which SQLite refuses to serve from a
 * standard index and turns into a full scan, confirmed by testing: 52s vs
 * 276ms for the same rows).
 */
export async function getFacetIndex(
  slug: FacetSlug,
  letter?: string
): Promise<FacetIndexEntry[]> {
  const facet = FACETS[slug];
  const client = await getClient();
  const wantsEverything = facet.sortMode === "numeric" || facet.singlePage;

  let where: string;
  let args: string[] = [];
  if (wantsEverything) {
    where = `${facet.column} IS NOT NULL`;
  } else if (letter === HASH_LETTER) {
    // Everything outside a-z. '{' is the character immediately after 'z',
    // so `>= '{'` catches values starting past the alphabet.
    where = `${facet.column} IS NOT NULL AND (${facet.column} < 'a' OR ${facet.column} >= '{')`;
  } else {
    const l = isValidLetter(letter) ? letter : "a";
    where = `${facet.column} >= ? AND ${facet.column} < ?`;
    args = [l, String.fromCharCode(l.charCodeAt(0) + 1)];
  }

  const known = await client.execute({
    sql: `SELECT ${facet.column} AS value, ${facet.displayColumn} AS label, COUNT(*) AS count
          FROM records
          WHERE ${where}
          GROUP BY ${facet.column}
          ORDER BY ${facet.sortMode === "numeric" ? "value" : "value COLLATE NOCASE"} ASC`,
    args,
  });

  const entries: FacetIndexEntry[] = known.rows.map((r) => ({
    value: String(r.value),
    label: String(r.label ?? r.value),
    count: Number(r.count),
  }));

  // Records with no value at all ("Unknown") live in the "#" bucket for
  // letter-paginated facets, and are always appended when everything's
  // already being listed on one page.
  if (wantsEverything || letter === HASH_LETTER) {
    const unknownCount = await client.execute(
      `SELECT COUNT(*) AS count FROM records WHERE ${facet.column} IS NULL`
    );
    const uc = Number(unknownCount.rows[0]?.count ?? 0);
    if (uc > 0) {
      entries.push({ value: UNKNOWN_VALUE, label: "Unknown", count: uc });
    }
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
