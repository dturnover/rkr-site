import Link from "next/link";
import { notFound } from "next/navigation";
import ResultsTable from "@/components/ResultsTable";
import { FACETS, isFacetSlug } from "@/lib/facetConfig";
import { getFacetValueRows } from "@/lib/queries/browse";
import { parsePage } from "@/lib/queries/shared";
import { toURLSearchParams, first, type RawSearchParams } from "@/lib/searchParamsUtil";

// Default-order page loads are fast (id-ordered, index-satisfied — see
// lib/queries/shared.ts), but an explicit column-header sort on a large
// facet value (e.g. a country with 70k+ tracks) forces a full sort that can
// take tens of seconds on the current Turso database.
export const maxDuration = 300;

export default async function FacetValuePage({
  params,
  searchParams,
}: {
  params: Promise<{ facet: string; value: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { facet: facetParam, value: valueParam } = await params;
  if (!isFacetSlug(facetParam)) notFound();

  const facet = FACETS[facetParam];
  const value = decodeURIComponent(valueParam);
  const sp = await searchParams;
  const sort = first(sp.sort) ?? "";
  const dir = first(sp.dir) ?? "asc";
  const page = parsePage(first(sp.page));

  const { rows, total, label } = await getFacetValueRows(facetParam, value, { sort, dir, page });

  if (total === 0 && page === 1) notFound();

  return (
    <div>
      <Link href={`/browse/${facet.slug}`} className="font-body text-sm text-ink-soft hover:text-rasta-red">
        &laquo; All {facet.label}
      </Link>
      <h1 className="font-display text-3xl text-ink mt-1 mb-1">{label}</h1>
      <p className="font-body text-ink-soft mb-6">
        {total.toLocaleString()} track{total === 1 ? "" : "s"}
      </p>
      <ResultsTable
        rows={rows}
        total={total}
        page={page}
        sort={sort}
        dir={dir}
        searchParams={toURLSearchParams(sp)}
      />
    </div>
  );
}
