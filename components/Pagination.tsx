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
}: {
  page: number;
  total: number;
  searchParams: URLSearchParams;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, page * PAGE_SIZE);

  const pageNumbers: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) {
    pageNumbers.push(p);
  }

  return (
    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3 font-body text-sm text-ink-soft">
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
