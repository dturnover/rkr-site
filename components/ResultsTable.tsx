import Link from "next/link";
import type { RecordListRow, SortKey } from "@/lib/queries/shared";
import { facetLink, type FacetSlug } from "@/lib/facetConfig";
import { isUncertainValue } from "@/lib/dataQuality";
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
  resultsHref,
}: {
  rows: RecordListRow[];
  total: number;
  page: number;
  sort: string;
  dir: string;
  searchParams: URLSearchParams;
  emptyMessage?: string;
  /** This results page's own URL (path + query), so record links can carry
   * a `back` param — without it, paging through dozens of matching records
   * meant relying entirely on the browser Back button, which loses your
   * exact scroll position and doesn't work at all if the record was opened
   * in a new tab (confirmed as a real friction point by UAT testing). */
  resultsHref?: string;
}) {
  if (rows.length === 0) {
    // total > 0 here means there ARE matching records — the requested page
    // number is just past the end (e.g. a stale bookmark, or someone
    // editing ?page= by hand). Previously this returned early with no
    // pagination controls at all, a dead end with no way back except
    // manually re-editing the URL (confirmed by testing: ?page=9999 on a
    // 1,416-page result set rendered "No records found" with nothing
    // clickable). Keeping Pagination visible lets them navigate to a page
    // that actually has results.
    return (
      <div>
        <p className="font-body italic text-ink-soft py-8 text-center">
          {total > 0
            ? `No records on this page — try an earlier page.`
            : (emptyMessage ?? "No records found.")}
        </p>
        {total > 0 && <Pagination page={page} total={total} searchParams={searchParams} />}
      </div>
    );
  }

  return (
    <div>
      <Pagination page={page} total={total} searchParams={searchParams} position="top" />
      <div className="overflow-x-auto border border-paper-stain">
        {/* min-w so the 12 percentage-based columns never get crushed below
            a readable width — on any screen wide enough to satisfy it
            (desktop/tablet), it's a no-op and cells just wrap normally with
            no scrollbar; on narrow phones, the table locks to this width
            and this wrapper's overflow-x-auto does real horizontal
            scrolling instead of squeezing every column to ~20-40px and
            wrapping text one character per line (confirmed by testing: a
            375px-wide viewport produced 38px-wide cells and 217px-tall
            rows before this fix). */}
        <table className="w-full min-w-[900px] table-fixed text-sm bg-paper">
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
                  const uncertain = typeof value === "string" && isUncertainValue(value);
                  const href =
                    value && col.link && !uncertain
                      ? col.link.type === "record"
                        ? `/records/${row.id}${resultsHref ? `?back=${encodeURIComponent(resultsHref)}` : ""}`
                        : facetLink(col.link.slug, String(value))
                      : null;
                  return (
                    <td
                      key={col.field}
                      className={`px-3 py-2 align-top break-words ${
                        col.mono ? "font-catalog text-xs" : "font-body"
                      }`}
                    >
                      {uncertain ? (
                        <span
                          className="italic text-ink-soft"
                          title="The compiler flagged this entry as uncertain — not a confirmed value."
                        >
                          {value}
                        </span>
                      ) : href ? (
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
