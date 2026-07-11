import { getClient } from "@/lib/db/client";

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

export async function getRecordById(id: number): Promise<RecordDetail | null> {
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT id, artist, artist_credit, title, title_credit, matrix_number, label_number,
                 label, country, format, producer, year, riddim, version, genre, notes,
                 song_origin, additions, b_side_artist, b_side_artist_credit, b_side_title,
                 b_side_title_credit, b_side_matrix_number, b_side_label_number
          FROM records WHERE id = ? LIMIT 1`,
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return res.rows[0] as unknown as RecordDetail;
}

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

// True when the only thing known about the B-side is its title (e.g. a dub
// "Version" that shares the A-side's artist/label/matrix info and so has
// nothing else recorded separately) — legitimate, but rendered with the
// same full field-list card as a fully-populated B-side, it reads as if the
// page stopped loading partway through rather than as expected sparse data.
export function bSideHasOnlyTitle(r: RecordDetail): boolean {
  return !!(r.b_side_title || r.b_side_title_credit) && !(
    r.b_side_artist ||
    r.b_side_artist_credit ||
    r.b_side_matrix_number ||
    r.b_side_label_number
  );
}
