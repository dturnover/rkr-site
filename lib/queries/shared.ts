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

export function buildOrderClause(sort: string | undefined, dir: string | undefined) {
  const sortKey = isSortKey(sort ?? "") ? (sort as SortKey) : "artist";
  const direction = dir === "desc" ? "DESC" : "ASC";
  const column = SORT_COLUMNS[sortKey];
  // NULLs last regardless of direction, so blank fields don't dominate either end.
  return {
    sortKey,
    direction: direction as "ASC" | "DESC",
    clause: `ORDER BY (${column} IS NULL) ASC, ${column} ${direction}`,
  };
}
