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

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, page * PAGE_SIZE);

  const pageNumbers: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) {
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
        {page > 1 && (
          <Link
            href={withParam(searchParams, "page", String(page - 1))}
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
              p === page
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
        {page < totalPages && (
          <Link
            href={withParam(searchParams, "page", String(page + 1))}
            className="px-2 py-1 border border-paper-stain hover:bg-paper"
          >
            Next &raquo;
          </Link>
        )}
      </div>
    </nav>
  );
}
