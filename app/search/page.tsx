import { headers } from "next/headers";
import ResultsTable from "@/components/ResultsTable";
import { keywordSearch, advancedSearch, type AdvancedSearchFields } from "@/lib/queries/search";
import { parsePage } from "@/lib/queries/shared";
import { toURLSearchParams, first, type RawSearchParams } from "@/lib/searchParamsUtil";
import { allowRequest } from "@/lib/rateLimit";

// Per-IP rate limit on search — defense-in-depth so one source can't hammer the
// (potentially expensive) search endpoint. Generous enough that no real person
// searching by hand will hit it; the platform firewall handles distributed
// floods. Search results are cached separately, so this mainly caps a single IP
// firing many *distinct* queries (cache misses) in a short burst.
const SEARCH_RATE_LIMIT = 40; // requests
const SEARCH_RATE_WINDOW_MS = 60_000; // per minute

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
  if (q.trim()) {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await allowRequest(`search:${ip}`, SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS);
    if (!allowed) {
      return (
        <div>
          <h1 className="font-display text-3xl text-ink mb-1">Search Results</h1>
          <p className="font-body text-ink-soft mb-6">
            You&rsquo;re searching very quickly — please wait a moment and try again.
          </p>
        </div>
      );
    }
  }

  const { rows, total } = !q.trim()
    ? { rows: [], total: 0 }
    : useField
      ? await advancedSearch({ [useField]: q } as AdvancedSearchFields, { sort, dir, page })
      : await keywordSearch(q, { sort, dir, page });

  return (
    <div>
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
