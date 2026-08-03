import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

export interface RecordDetail {
  id: number;
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
    const res = await client.execute({
      sql: `SELECT id, artist, artist_credit, title, title_credit, matrix_number, label_number,
                   label, country, format, pressing, producer, year, riddim, version, genre, notes,
                   song_origin, additions, b_side_artist, b_side_artist_credit, b_side_title,
                   b_side_title_credit, b_side_matrix_number, b_side_label_number
            FROM records WHERE id = ? LIMIT 1`,
      args: [id],
    });
    if (res.rows.length === 0) return null;
    return res.rows[0] as unknown as RecordDetail;
  },
  ["record-by-id"],
  { tags: [CATALOGUE_TAG], revalidate: 3600 },
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
