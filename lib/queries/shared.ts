export const PAGE_SIZE = 50;

export type SortKey =
  | "artist"
  | "title"
  | "label"
  | "label_number"
  | "matrix_number"
  | "country"
  | "year"
  | "format"
  | "riddim"
  | "producer";

export const SORT_COLUMNS: Record<SortKey, string> = {
  artist: "artist_norm",
  title: "title",
  label: "label_norm",
  label_number: "label_number",
  matrix_number: "matrix_number",
  country: "country_norm",
  year: "year_sort",
  format: "format_norm",
  riddim: "riddim_norm",
  producer: "producer_norm",
};

export function isSortKey(value: string | undefined | null): value is SortKey {
  return !!value && Object.prototype.hasOwnProperty.call(SORT_COLUMNS, value);
}

export function parsePage(value: string | undefined | null): number {
  const n = parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export interface RecordListRow {
  id: number;
  artist: string | null;
  artist_credit: string | null;
  title: string | null;
  title_credit: string | null;
  label: string | null;
  label_number: string | null;
  matrix_number: string | null;
  country: string | null;
  year: string | null;
  format: string | null;
  riddim: string | null;
  producer: string | null;
}

export const RESULT_COLUMNS = `
  id, artist, artist_credit, title, title_credit, label, label_number,
  matrix_number, country, year, format, riddim, producer
`;

// A default (unrequested) sort should still feel expected — alphabetical by
// artist, the way a physical discography is browsed — but sorting forces a
// full temp-B-tree of the entire filtered result set before the first page
// can return (confirmed by testing: ~46s for a 70k-row facet value like
// country=JA). That cost scales with the *result* size, not the table size,
// so it's cheap for a typical search or browse result (a few thousand rows
// at most) and only a problem for a handful of very large facet values.
// Below this threshold, default to alphabetical; at or above it, fall back
// to id order (already index-satisfied, no sort step needed) to keep those
// pages fast. Callers that don't know their result count yet (total
// omitted) get the safe (id) behavior.
export const ALPHA_SORT_THRESHOLD = 5000;

export function buildOrderClause(sort: string | undefined, dir: string | undefined, total?: number) {
  if (!isSortKey(sort ?? "")) {
    if (total !== undefined && total <= ALPHA_SORT_THRESHOLD) {
      return {
        sortKey: "artist" as const,
        direction: "ASC" as const,
        clause: `ORDER BY (artist_norm IS NULL) ASC, artist_norm ASC`,
      };
    }
    return {
      sortKey: "id" as const,
      direction: "ASC" as const,
      clause: `ORDER BY id ASC`,
    };
  }
  const sortKey = sort as SortKey;
  const direction = dir === "desc" ? "DESC" : "ASC";
  const column = SORT_COLUMNS[sortKey];
  // NULLs last regardless of direction, so blank fields don't dominate either end.
  return {
    sortKey,
    direction: direction as "ASC" | "DESC",
    clause: `ORDER BY (${column} IS NULL) ASC, ${column} ${direction}`,
  };
}
