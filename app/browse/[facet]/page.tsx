import { notFound } from "next/navigation";
import FacetBrowseIndex from "@/components/FacetBrowseIndex";
import { FACETS, isFacetSlug } from "@/lib/facetConfig";
import { getFacetIndex, isValidLetter } from "@/lib/queries/browse";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

export const maxDuration = 300;

export default async function FacetIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ facet: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { facet: facetParam } = await params;
  if (!isFacetSlug(facetParam)) notFound();

  const facet = FACETS[facetParam];
  const sp = await searchParams;
  const rawLetter = first(sp.letter)?.toLowerCase();
  const letter =
    facet.sortMode === "alpha" ? (isValidLetter(rawLetter) ? rawLetter : "a") : undefined;

  const entries = await getFacetIndex(facetParam, letter);

  const countText =
    facet.sortMode === "alpha"
      ? `${entries.length.toLocaleString()} ${facet.singular.toLowerCase()}${entries.length === 1 ? "" : "s"} under “${letter!.toUpperCase()}”`
      : `${entries.length.toLocaleString()} distinct ${facet.singular.toLowerCase()}${entries.length === 1 ? "" : "s"}`;

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-1 text-center">{facet.label}</h1>
      <p className="font-body text-ink-soft mb-6 text-center">
        {countText} &mdash; select one to see its tracks.
      </p>
      <FacetBrowseIndex facet={facet} entries={entries} letter={letter} />
    </div>
  );
}
