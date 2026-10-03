import { getClient } from "@/lib/db/client";

// Shared sitemap helpers used by both app/sitemap.ts (to emit the URLs) and
// app/robots.ts (to list the child sitemaps). Kept in one place so the chunk
// math can't drift between them.

// Google caps a single sitemap at 50,000 URLs. Stay under it with headroom for
// the handful of static entries that ride along in chunk 0.
export const RECORDS_PER_SITEMAP = 45000;

// Chunks are id RANGES, not "the nth 45,000 rows".
//
// The obvious version — COUNT(*) for the number of chunks, then
// ORDER BY id LIMIT 45000 OFFSET n for each — reads far more than it returns:
// the count reads every row, and an OFFSET makes the database walk past every
// row before the ones it wants, so the last chunk read the whole catalogue to
// hand back its final third. Robots, the sitemap index and each chunk all ran
// these, every day.
//
// Splitting by id range instead costs one row for the size (MAX of the
// primary key is a single seek) and exactly the rows each chunk contains.
// Ids have gaps (deleted and re-imported records), so a chunk can hold fewer
// than RECORDS_PER_SITEMAP — never more, which is the limit that matters.

/** Highest record id, or 0 if there is no catalogue yet / the DB is
 *  unreachable (e.g. a fresh deploy at build time). Never throws. */
async function maxRecordId(): Promise<number> {
  try {
    const client = await getClient();
    const res = await client.execute("SELECT MAX(id) AS m FROM records");
    return Number((res.rows[0] as unknown as { m: number | null }).m) || 0;
  } catch {
    return 0;
  }
}

/** Record ids for one sitemap chunk — ids in (chunk*N, (chunk+1)*N] — ordered
 *  by id. Never throws. */
export async function recordIdsForChunk(chunk: number): Promise<number[]> {
  try {
    const client = await getClient();
    const res = await client.execute({
      sql: "SELECT id FROM records WHERE id > ? AND id <= ? ORDER BY id",
      args: [chunk * RECORDS_PER_SITEMAP, (chunk + 1) * RECORDS_PER_SITEMAP],
    });
    return res.rows.map((r) => Number((r as unknown as { id: number }).id));
  } catch {
    return [];
  }
}

/** How many child sitemaps to emit — always at least one (chunk 0 carries the
 *  static pages even when the catalogue is empty). */
export async function sitemapChunkCount(): Promise<number> {
  const maxId = await maxRecordId();
  return Math.max(1, Math.ceil(maxId / RECORDS_PER_SITEMAP));
}
