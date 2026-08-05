import type { MetadataRoute } from "next";
import { FACETS, type FacetSlug } from "@/lib/facetConfig";
import { RECORDS_PER_SITEMAP, recordIds, sitemapChunkCount } from "@/lib/seo";
import { SITE_URL } from "@/lib/siteUrl";

// Rebuild the sitemap at most once a day. The catalogue changes when an admin
// uploads a new CSV, which can happen WITHOUT a redeploy, so a purely
// build-time (static) sitemap would slowly go stale as records are added.
export const revalidate = 86400;

function staticEntries(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/advanced-search`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/guide`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/interviews`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/history`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4 },
  ];
  // The browse landing pages (one per facet) — not every facet *value*, which
  // would balloon the sitemap with thin, filter-style pages; the record detail
  // pages below are the canonical content worth indexing.
  for (const slug of Object.keys(FACETS) as FacetSlug[]) {
    entries.push({ url: `${SITE_URL}/browse/${slug}`, changeFrequency: "weekly", priority: 0.5 });
  }
  return entries;
}

export async function generateSitemaps() {
  const chunks = await sitemapChunkCount();
  return Array.from({ length: chunks }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const chunk = Number(await id) || 0;
  const ids = await recordIds(RECORDS_PER_SITEMAP, chunk * RECORDS_PER_SITEMAP);
  const records: MetadataRoute.Sitemap = ids.map((rid) => ({
    url: `${SITE_URL}/records/${rid}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Static/browse pages live in the first chunk only.
  return chunk === 0 ? [...staticEntries(), ...records] : records;
}
