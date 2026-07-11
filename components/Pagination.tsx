import Link from "next/link";
import { PAGE_SIZE } from "@/lib/queries/shared";

function withParam(searchParams: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(searchParams);
  next.set(key, value);
  return `?${next.toString()}`;
}

export default function Pagination({
  page,
  total,
  searchParams,
  position = "bottom",
}: {
  page: number;
  total: number;
  searchParams: URLSearchParams;
  position?: "top" | "bottom";
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;

  // `page` can be arbitrarily out of range (a stale bookmark, or someone
  // hand-editing ?page=), and the fallback for "no records on this page"
  // (ResultsTable) now keeps Pagination visible specifically so there's a
  // way back — clamping is what makes that possible. Without it, e.g.
  // page=9999 against 1,416 real pages made the nearby-range loop below run
  // backwards (page-2=9997 > totalPages=1416) and produce an empty range,
  // silently dropping every link including Prev/First/Last (confirmed by
  // testing). Clamping shows the bar as if you'd landed on the nearest
  // valid page instead.
  const effectivePage = Math.min(Math.max(1, page), totalPages);

  const start = (effectivePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, effectivePage * PAGE_SIZE);

  const pageNumbers: number[] = [];
  for (let p = Math.max(1, effectivePage - 2); p <= Math.min(totalPages, effectivePage + 2); p++) {
    pageNumbers.push(p);
  }

  // First/Last jump straight to page 1 / totalPages — without them, reaching
  // page 1,416 of a large facet (e.g. Country -> JA) means clicking Next
  // over a thousand times, since the numbered links only ever show the
  // handful of pages nearest the current one.
  const showFirst = pageNumbers[0] > 1;
  const showFirstGap = pageNumbers[0] > 2;
  const showLast = pageNumbers[pageNumbers.length - 1] < totalPages;
  const showLastGap = pageNumbers[pageNumbers.length - 1] < totalPages - 1;

  return (
    <nav
      className={`${position === "top" ? "mb-5" : "mt-5"} flex flex-wrap items-center justify-between gap-3 font-body text-sm text-ink-soft`}
    >
      <p>
        Showing {start.toLocaleString()}&ndash;{end.toLocaleString()} of{" "}
        {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        {effectivePage > 1 && (
          <Link
            href={withParam(searchParams, "page", String(effectivePage - 1))}
            className="px-2 py-1 border border-paper-stain hover:bg-paper"
          >
            &laquo; Prev
          </Link>
        )}
        {showFirst && (
          <>
            <Link
              href={withParam(searchParams, "page", "1")}
              className="px-2 py-1 border border-paper-stain hover:bg-paper text-ink"
            >
              1
            </Link>
            {showFirstGap && <span className="px-1">&hellip;</span>}
          </>
        )}
        {pageNumbers.map((p) => (
          <Link
            key={p}
            href={withParam(searchParams, "page", String(p))}
            className={`px-2 py-1 border ${
              p === effectivePage
                ? "bg-frame text-paper border-frame"
                : "border-paper-stain hover:bg-paper text-ink"
            }`}
          >
            {p}
          </Link>
        ))}
        {showLast && (
          <>
            {showLastGap && <span className="px-1">&hellip;</span>}
            <Link
              href={withParam(searchParams, "page", String(totalPages))}
              className="px-2 py-1 border border-paper-stain hover:bg-paper text-ink"
            >
              {totalPages.toLocaleString()}
            </Link>
          </>
        )}
        {effectivePage < totalPages && (
          <Link
            href={withParam(searchParams, "page", String(effectivePage + 1))}
            className="px-2 py-1 border border-paper-stain hover:bg-paper"
          >
            Next &raquo;
          </Link>
        )}
      </div>
    </nav>
  );
}
