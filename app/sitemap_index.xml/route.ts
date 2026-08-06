import { sitemapChunkCount } from "@/lib/seo";
import { SITE_URL } from "@/lib/siteUrl";

// A standard <sitemapindex> pointing at the child sitemaps.
//
// generateSitemaps() emits /sitemap/0.xml, /sitemap/1.xml, … and this Next
// version serves no combined index of its own (/sitemap.xml 404s). robots.txt
// lists every child, which is enough for a crawler that reads it — but Google
// Search Console expects ONE sitemap URL to submit, and submitting four
// separately is easy to get wrong or leave half-done. This gives a single
// canonical URL that resolves to all of them.
export const revalidate = 86400; // match the child sitemaps' cadence

export async function GET() {
  const chunks = await sitemapChunkCount();
  const entries = Array.from(
    { length: chunks },
    (_, i) => `  <sitemap><loc>${SITE_URL}/sitemap/${i}.xml</loc></sitemap>`
  ).join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</sitemapindex>\n`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
