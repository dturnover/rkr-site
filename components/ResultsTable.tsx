import Link from "next/link";
import type { RecordListRow, SortKey } from "@/lib/queries/shared";
import { facetLink, type FacetSlug } from "@/lib/facetConfig";
import Pagination from "./Pagination";

type CellLink = { type: "record" } | { type: "facet"; slug: FacetSlug };

const COLUMNS: {
  key: SortKey;
  label: string;
  field: keyof RecordListRow;
  mono?: boolean;
  link?: CellLink;
  width: string;
}[] = [
  { key: "artist", label: "Artist", field: "artist", link: { type: "facet", slug: "artists" }, width: "11%" },
  { key: "artist", label: "Artist Credit", field: "artist_credit", width: "10%" },
  { key: "title", label: "Title", field: "title", link: { type: "record" }, width: "12%" },
  { key: "title", label: "Title Credit", field: "title_credit", width: "10%" },
  { key: "label", label: "Label", field: "label", link: { type: "facet", slug: "labels" }, width: "9%" },
  { key: "label_number", label: "Label No.", field: "label_number", mono: true, width: "7%" },
  { key: "matrix_number", label: "Matrix No.", field: "matrix_number", mono: true, width: "8%" },
  { key: "country", label: "Country", field: "country", link: { type: "facet", slug: "countries" }, width: "5%" },
  { key: "year", label: "Year", field: "year", link: { type: "facet", slug: "years" }, width: "5%" },
  { key: "format", label: "Format", field: "format", link: { type: "facet", slug: "formats" }, width: "5%" },
  { key: "riddim", label: "Riddim", field: "riddim", link: { type: "facet", slug: "riddims" }, width: "9%" },
  { key: "producer", label: "Producer", field: "producer", link: { type: "facet", slug: "producers" }, width: "9%" },
];

// Only these get a clickable sort header — the "credit" variants sort by
// the same underlying key as their main column, so we dedupe by sort key.
const SORTABLE_HEADER_FIELDS = new Set<keyof RecordListRow>([
  "artist",
  "title",
  "label",
  "label_number",
  "matrix_number",
  "country",
  "year",
  "format",
  "riddim",
  "producer",
]);

function sortLink(searchParams: URLSearchParams, key: SortKey, currentSort: string, currentDir: string) {
  const next = new URLSearchParams(searchParams);
  const nextDir = currentSort === key && currentDir === "asc" ? "desc" : "asc";
  next.set("sort", key);
  next.set("dir", nextDir);
  next.delete("page");
  return `?${next.toString()}`;
}

export default function ResultsTable({
  rows,
  total,
  page,
  sort,
  dir,
  searchParams,
  emptyMessage,
}: {
  rows: RecordListRow[];
  total: number;
  page: number;
  sort: string;
  dir: string;
  searchParams: URLSearchParams;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="font-body italic text-ink-soft py-8 text-center">
        {emptyMessage ?? "No records found."}
      </p>
    );
  }

  return (
    <div>
      <Pagination page={page} total={total} searchParams={searchParams} position="top" />
      <div className="overflow-x-auto border border-paper-stain">
        <table className="w-full table-fixed text-sm bg-paper">
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.field} style={{ width: col.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-parchment-deep border-b-2 border-frame">
              {COLUMNS.map((col) => {
                const isSortable = SORTABLE_HEADER_FIELDS.has(col.field);
                const isActive = sort === col.key;
                return (
                  <th
                    key={col.field}
                    className="text-left font-body font-semibold px-3 py-2"
                  >
                    {isSortable ? (
                      <Link
                        href={sortLink(searchParams, col.key, sort, dir)}
                        className="text-ink hover:text-rasta-red"
                      >
                        {col.label}
                        {isActive ? (dir === "asc" ? " ↑" : " ↓") : ""}
                      </Link>
                    ) : (
                      <span className="text-ink">{col.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b border-paper-stain/60 ${
                  i % 2 === 1 ? "bg-parchment/30" : ""
                } hover:bg-parchment-deep/40`}
              >
                {COLUMNS.map((col) => {
                  const value = row[col.field];
                  const href =
                    value && col.link
                      ? col.link.type === "record"
                        ? `/records/${row.id}`
                        : facetLink(col.link.slug, String(value))
                      : null;
                  return (
                    <td
                      key={col.field}
                      className={`px-3 py-2 align-top break-words ${
                        col.mono ? "font-catalog text-xs" : "font-body"
                      }`}
                    >
                      {href ? (
                        <Link
                          href={href}
                          className={
                            col.link?.type === "record"
                              ? "text-link font-semibold hover:text-rasta-red"
                              : "text-ink hover:text-rasta-red hover:underline"
                          }
                        >
                          {value}
                        </Link>
                      ) : (
                        <span className="text-ink">{value ?? ""}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} searchParams={searchParams} />
    </div>
  );
}
