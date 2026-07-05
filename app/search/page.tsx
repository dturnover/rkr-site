import ResultsTable from "@/components/ResultsTable";
import { keywordSearch } from "@/lib/queries/search";
import { parsePage } from "@/lib/queries/shared";
import { toURLSearchParams, first, type RawSearchParams } from "@/lib/searchParamsUtil";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const sort = first(sp.sort) ?? "";
  const dir = first(sp.dir) ?? "asc";
  const page = parsePage(first(sp.page));

  const { rows, total } = q.trim()
    ? await keywordSearch(q, { sort, dir, page })
    : { rows: [], total: 0 };

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-1">Search Results</h1>
      <p className="font-body text-ink-soft mb-6">
        {q ? (
          <>
            {total.toLocaleString()} result{total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
          </>
        ) : (
          "Enter a title or artist above to search the catalogue."
        )}
      </p>
      {q.trim() && (
        <ResultsTable
          rows={rows}
          total={total}
          page={page}
          sort={sort}
          dir={dir}
          searchParams={toURLSearchParams(sp)}
          emptyMessage={`No tracks matched "${q}".`}
        />
      )}
    </div>
  );
}
