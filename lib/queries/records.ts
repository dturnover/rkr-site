import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

export interface RecordDetail {
  id: number;
  // The content-derived identity (lib/editor/overlay.ts computeRecordKey), as
  // stored on the row. Needed to look up the record's permanent catalogue
  // number, which is filed against this and not against the id. Read the
  // STORED value rather than recomputing it: an editor changing artist, title
  // or matrix number would change what computeRecordKey returns, but the row
  // stays pinned to the key the overlay filed it under (see setFieldEdit).
  record_key: string | null;
  /** The permanent catalogue number (lib/recordNumbers.ts), joined in here so a
   * record view costs one query rather than two. Null when the record has no
   * number yet. */
  catalogue_number: number | null;
  artist: string | null;
  artist_credit: string | null;
  title: string | null;
  title_credit: string | null;
  matrix_number: string | null;
  label_number: string | null;
  label: string | null;
  country: string | null;
  format: string | null;
  pressing: string | null;
  producer: string | null;
  year: string | null;
  riddim: string | null;
  version: string | null;
  genre: string | null;
  notes: string | null;
  song_origin: string | null;
  additions: string | null;
  b_side_artist: string | null;
  b_side_artist_credit: string | null;
  b_side_title: string | null;
  b_side_title_credit: string | null;
  b_side_matrix_number: string | null;
  b_side_label_number: string | null;
}

// Cached: record detail pages are the most-viewed, most-shared pages, so the
// per-id lookup is served from Next's data cache instead of hitting the DB on
// every view. Invalidated immediately on any editor edit/import (CATALOGUE_TAG);
// the 1-hour revalidate is just a safety net. Note: no cookies/headers are read
// here, which is required for unstable_cache — the session check stays in the page.
export const getRecordById = unstable_cache(
  async (id: number): Promise<RecordDetail | null> => {
    const client = await getClient();
    const columns = `r.id, r.record_key, r.artist, r.artist_credit, r.title, r.title_credit,
                     r.matrix_number, r.label_number, r.label, r.country, r.format, r.pressing,
                     r.producer, r.year, r.riddim, r.version, r.genre, r.notes, r.song_origin,
                     r.additions, r.b_side_artist, r.b_side_artist_credit, r.b_side_title,
                     r.b_side_title_credit, r.b_side_matrix_number, r.b_side_label_number`;

    // The catalogue number comes back on this query rather than a second one.
    // It used to be its own lookup from the page, which meant every record view
    // cost TWO round trips to Turso instead of one — on the single most
    // requested route in the site, and the one a distributed scrape walks. A
    // burst of 87k requests across distinct ids (so, all cache misses) is what
    // pushed the database into 429 rate-limiting; halving the queries per view
    // halves what any such burst costs us.
    try {
      const res = await client.execute({
        sql: `SELECT ${columns}, n.number AS catalogue_number
                FROM records r
                LEFT JOIN record_numbers n ON n.record_key = r.record_key
               WHERE r.id = ? LIMIT 1`,
        args: [id],
      });
      if (res.rows.length === 0) return null;
      return res.rows[0] as unknown as RecordDetail;
    } catch {
      // No record_numbers table — a database that has never run an import, or
      // a catalogue restored from a generation built before numbering existed.
      // The record itself must still load, so fall back to the plain query and
      // simply have no number.
      const res = await client.execute({
        sql: `SELECT ${columns} FROM records r WHERE r.id = ? LIMIT 1`,
        args: [id],
      });
      if (res.rows.length === 0) return null;
      return { ...(res.rows[0] as unknown as RecordDetail), catalogue_number: null };
    }
  },
  ["record-by-id-v3"],
  // A day, to match the record page. Next serves the SHORTEST revalidate of a
  // page and every cache its render touches, so an hour here would silently
  // cap all 135k record pages at an hour too. Every write flushes this by
  // tag, so freshness never depended on the window.
  { tags: [CATALOGUE_TAG], revalidate: 86_400 },
);

export function hasBSide(r: RecordDetail): boolean {
  return !!(
    r.b_side_artist ||
    r.b_side_artist_credit ||
    r.b_side_title ||
    r.b_side_title_credit ||
    r.b_side_matrix_number ||
    r.b_side_label_number
  );
}
