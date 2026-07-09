import AdvancedSearchForm from "@/components/AdvancedSearchForm";
import ResultsTable from "@/components/ResultsTable";
import { advancedSearch, hasAnyField, type AdvancedSearchFields } from "@/lib/queries/search";
import { parsePage } from "@/lib/queries/shared";
import { toURLSearchParams, first, type RawSearchParams } from "@/lib/searchParamsUtil";

// Single-field substring LIKE scans (no compound/trigram index available yet)
// can take up to ~100s on the current Turso database for common fields —
// well past Vercel's default function duration. See lib/queries/search.ts.
export const maxDuration = 300;

const FIELD_NAMES: (keyof AdvancedSearchFields)[] = [
  "artist",
  "title",
  "label",
  "labelNumber",
  "matrixNumber",
  "producer",
  "country",
  "format",
  "year",
  "genre",
  "riddim",
  "origin",
  "notes",
];

export default async function AdvancedSearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const sort = first(sp.sort) ?? "";
  const dir = first(sp.dir) ?? "asc";
  const page = parsePage(first(sp.page));

  const fields: AdvancedSearchFields = {};
  const formValues: Record<string, string | undefined> = {};
  for (const name of FIELD_NAMES) {
    const v = first(sp[name]);
    if (v) fields[name] = v;
    formValues[name] = v;
  }

  const hasQuery = hasAnyField(fields);
  const { rows, total } = hasQuery
    ? await advancedSearch(fields, { sort, dir, page })
    : { rows: [], total: 0 };

  return (
    <div>
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-3xl text-ink mb-1 text-center">Advanced Search</h1>
        <p className="font-body text-ink-soft mb-6 text-center">
          Combine any of the fields below &mdash; all filled fields must match.
        </p>
        <AdvancedSearchForm values={formValues} />
      </div>

      {hasQuery && (
        <div className="mt-8">
          <p className="font-body text-ink-soft mb-3">
            {total.toLocaleString()} result{total === 1 ? "" : "s"}
          </p>
          <ResultsTable
            rows={rows}
            total={total}
            page={page}
            sort={sort}
            dir={dir}
            searchParams={toURLSearchParams(sp)}
            emptyMessage="No tracks matched those filters."
          />
        </div>
      )}
    </div>
  );
}
