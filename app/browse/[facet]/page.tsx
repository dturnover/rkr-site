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
  const paginated = facet.sortMode === "alpha" && !facet.singlePage;
  const rawLetter = first(sp.letter)?.toLowerCase();
  const letter = paginated ? (isValidLetter(rawLetter) ? rawLetter : "a") : undefined;

  const entries = await getFacetIndex(facetParam, letter);

  // facet.label is already correctly pluralized ("Countries", not
  // "Countrys") — use it instead of naively appending "s" to the singular.
  const noun = entries.length === 1 ? facet.singular.toLowerCase() : facet.label.toLowerCase();
  const countText = paginated
    ? `${entries.length.toLocaleString()} ${noun} under “${letter!.toUpperCase()}”`
    : `${entries.length.toLocaleString()} distinct ${noun}`;

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
