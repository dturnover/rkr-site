import { notFound } from "next/navigation";
import FacetBrowseIndex from "@/components/FacetBrowseIndex";
import { FACETS, isFacetSlug } from "@/lib/facetConfig";
import { getFacetIndex } from "@/lib/queries/browse";

export default async function FacetIndexPage({
  params,
}: {
  params: Promise<{ facet: string }>;
}) {
  const { facet: facetParam } = await params;
  if (!isFacetSlug(facetParam)) notFound();

  const facet = FACETS[facetParam];
  const entries = await getFacetIndex(facetParam);

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-1 text-center">{facet.label}</h1>
      <p className="font-body text-ink-soft mb-6 text-center">
        {entries.length.toLocaleString()} distinct {facet.singular.toLowerCase()}
        {entries.length === 1 ? "" : "s"} &mdash; select one to see its tracks.
      </p>
      <FacetBrowseIndex facet={facet} entries={entries} />
    </div>
  );
}
