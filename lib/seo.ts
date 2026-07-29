import { getClient } from "@/lib/db/client";

// Shared sitemap helpers used by both app/sitemap.ts (to emit the URLs) and
// app/robots.ts (to list the child sitemaps). Kept in one place so the chunk
// math can't drift between them.

// Google caps a single sitemap at 50,000 URLs. Stay under it with headroom for
// the handful of static entries that ride along in chunk 0.
export const RECORDS_PER_SITEMAP = 45000;

/** Total rows in the live catalogue, or 0 if there is no catalogue yet / the
 *  DB is unreachable (e.g. a fresh deploy at build time). Never throws. */
export async function recordCount(): Promise<number> {
  try {
    const client = await getClient();
    const res = await client.execute("SELECT COUNT(*) AS n FROM records");
    return Number((res.rows[0] as unknown as { n: number }).n) || 0;
  } catch {
    return 0;
  }
}

/** Record ids for one sitemap chunk, ordered by id. Never throws. */
export async function recordIds(limit: number, offset: number): Promise<number[]> {
  try {
    const client = await getClient();
    const res = await client.execute({
      sql: "SELECT id FROM records ORDER BY id LIMIT ? OFFSET ?",
      args: [limit, offset],
    });
    return res.rows.map((r) => Number((r as unknown as { id: number }).id));
  } catch {
    return [];
  }
}

/** How many child sitemaps to emit — always at least one (chunk 0 carries the
 *  static pages even when the catalogue is empty). */
export async function sitemapChunkCount(): Promise<number> {
  const count = await recordCount();
  return Math.max(1, Math.ceil(count / RECORDS_PER_SITEMAP));
}
