import ResultsTable from "@/components/ResultsTable";
import { keywordSearch, advancedSearch, type AdvancedSearchFields } from "@/lib/queries/search";
import { parsePage } from "@/lib/queries/shared";
import { toURLSearchParams, first, type RawSearchParams } from "@/lib/searchParamsUtil";
import { allowSearch } from "@/lib/searchThrottle";
import { checkCrawlGuard, RESULTS_PAGE_WEIGHT, type GuardVerdict } from "@/lib/crawlGuard";
import { CrawlBlocked, CrawlWarning } from "@/components/CrawlNotice";

// Field-selector searches route through advancedSearch()'s single-field
// substring LIKE, which can take up to ~100s on the current Turso database
// (no compound/trigram index available yet) — see lib/queries/search.ts.
export const maxDuration = 300;

const FIELD_LABELS: Record<keyof AdvancedSearchFields, string> = {
  artist: "Artist",
  title: "Title",
  label: "Label",
  labelNumber: "Label No.",
  matrixNumber: "Matrix No.",
  producer: "Producer",
  country: "Country",
  format: "Format",
  year: "Year",
  genre: "Genre",
  riddim: "Riddim",
  origin: "Origin",
  notes: "Notes",
};

function isAdvancedField(value: string): value is keyof AdvancedSearchFields {
  return Object.prototype.hasOwnProperty.call(FIELD_LABELS, value);
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const field = first(sp.field) ?? "keyword";
  const sort = first(sp.sort) ?? "";
  const dir = first(sp.dir) ?? "asc";
  const page = parsePage(first(sp.page));

  const useField = q.trim() && isAdvancedField(field) ? field : null;

  // Throttle before doing any query work. Only actual searches (q present)
  // count against the limit; an empty search does no work.
  let guard: GuardVerdict = { action: "allow" };
  if (q.trim()) {
    if (!(await allowSearch())) {
      return (
        <div>
          <h1 className="font-display text-3xl text-ink mb-1">Search Results</h1>
          <p className="font-body text-ink-soft mb-6">
            You&rsquo;re searching very quickly — please wait a moment and try again.
          </p>
        </div>
      );
    }
    // The throttle above caps how many *queries* one source can run; this caps
    // how much of the catalogue it can carry away, which paging through one
    // broad search would otherwise do just as well as crawling.
    guard = await checkCrawlGuard({ weight: RESULTS_PAGE_WEIGHT });
    if (guard.action === "block") {
      return <CrawlBlocked retryAfterMinutes={guard.retryAfterMinutes} />;
    }
  }

  const { rows, total } = !q.trim()
    ? { rows: [], total: 0 }
    : useField
      ? await advancedSearch({ [useField]: q } as AdvancedSearchFields, { sort, dir, page })
      : await keywordSearch(q, { sort, dir, page });

  return (
    <div>
      {guard.action === "warn" && <CrawlWarning />}
      <h1 className="font-display text-3xl text-ink mb-1">Search Results</h1>
      <p className="font-body text-ink-soft mb-6">
        {q ? (
          <>
            {total.toLocaleString()} result{total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
            {useField && <> in {FIELD_LABELS[useField]}</>}
          </>
        ) : (
          "Enter a search term above."
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
          resultsHref={`/search?${toURLSearchParams(sp).toString()}`}
        />
      )}
    </div>
  );
}
