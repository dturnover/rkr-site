import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { FACET_TAG } from "@/lib/cacheTags";
import { FACETS, facetLink, type FacetSlug } from "@/lib/facetConfig";
import { isUncertainValue } from "@/lib/dataQuality";
import { indexCandidates, suggestNames, type IndexedCandidate } from "@/lib/fuzzy";

// "Did you mean…?" for a search that found nothing.
//
// Compares what was typed against every artist, label, producer and riddim
// name in the catalogue and offers the closest few — see lib/fuzzy.ts for how
// "closest" is measured. Names only: that's where spelling varies most in this
// catalogue, and where a searcher is least likely to know the official form.
//
// COST, which is why it's built this way: it runs only when a search has
// already come back empty, and it never queries per search. Each name list is
// one GROUP BY, cached for a week under FACET_TAG — so it's rebuilt only when
// a browse-category field changes or the catalogue is reimported, exactly like
// the browse indexes it mirrors. The comparison itself happens in memory.

/** The facets suggestions are drawn from, and what to call each in the UI. */
const SUGGEST_FACETS: { slug: FacetSlug; kind: string }[] = [
  { slug: "artists", kind: "artist" },
  { slug: "labels", kind: "label" },
  { slug: "producers", kind: "producer" },
  { slug: "riddims", kind: "riddim" },
];

/** Which facet a single-field search (`/search?field=artist`) maps to. A
 * search in one field only gets suggestions of that kind. */
const FIELD_TO_FACET: Record<string, FacetSlug> = {
  artist: "artists",
  label: "labels",
  producer: "producers",
  riddim: "riddims",
};

/** Every distinct name in one facet with its record count, as [name, count]
 * pairs — compact on purpose: Vercel won't cache an entry over 2 MB, and the
 * artist list is ~19k names (~430 KB this way). An entry that failed to cache
 * would mean a full GROUP BY on every empty search. */
function loadNames(slug: FacetSlug): Promise<[string, number][]> {
  const facet = FACETS[slug];
  return unstable_cache(
    async (): Promise<[string, number][]> => {
      const client = await getClient();
      const res = await client.execute(
        `SELECT ${facet.displayColumn} AS name, COUNT(*) AS c
           FROM records
          WHERE ${facet.column} IS NOT NULL
          GROUP BY ${facet.column}`
      );
      const out: [string, number][] = [];
      for (const r of res.rows) {
        const name = String((r as unknown as { name: string | null }).name ?? "").trim();
        if (!name || isUncertainValue(name)) continue;
        out.push([name, Number((r as unknown as { c: number }).c)]);
      }
      return out;
    },
    ["suggest-names-v1", slug],
    { tags: [FACET_TAG], revalidate: 604_800 }
  )();
}

// Indexing (splitting every name into trigrams) takes ~0.6 s for all four
// lists, so it's done once per server instance and kept. An hour is the
// longest a newly added name can go unsuggested on a warm instance; the
// underlying lists are what's cache-invalidated.
const INDEX_TTL_MS = 60 * 60 * 1000;
const indexes = new Map<FacetSlug, { at: number; index: IndexedCandidate[] }>();

async function indexFor(slug: FacetSlug, kind: string): Promise<IndexedCandidate[]> {
  const hit = indexes.get(slug);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.index;
  const names = await loadNames(slug);
  const index = indexCandidates(names.map(([name, count]) => ({ name, count, kind })));
  indexes.set(slug, { at: Date.now(), index });
  return index;
}

export interface NameSuggestion {
  name: string;
  kind: string;
  count: number;
  /** The name's browse page — every record under it. */
  href: string;
}

/** Up to three names close to `query`, or none. `field` narrows to one kind
 * when the search was in a single field; omit it for the keyword box. Never
 * throws: a suggestion is an extra, and must not be why a page fails. */
export async function suggestForQuery(query: string, field?: string | null): Promise<NameSuggestion[]> {
  try {
    const only = field ? FIELD_TO_FACET[field] : undefined;
    if (field && !only) return []; // e.g. a title or matrix-number search
    const facets = SUGGEST_FACETS.filter((f) => !only || f.slug === only);
    const pools = await Promise.all(facets.map((f) => indexFor(f.slug, f.kind)));
    const slugOfKind = new Map(facets.map((f) => [f.kind, f.slug]));
    return suggestNames(query, pools.flat())
      .map((s) => {
        const href = facetLink(slugOfKind.get(s.kind)!, s.name);
        return href ? { name: s.name, kind: s.kind, count: s.count, href } : null;
      })
      .filter((s): s is NameSuggestion => s !== null);
  } catch {
    return [];
  }
}
