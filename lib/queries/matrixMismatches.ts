import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// A worklist of songs whose matrix number is recorded one way on their own
// entry and another way where they appear as somebody else's B side.
//
// The same song is stored twice — once as an entry of its own, once as a stub
// on the back of its pair — and the two drifted apart historically: early on
// only partial matrix numbers were entered in the B-side column, before the
// full matrix was understood to matter. The compiler is cleaning those up by
// hand, so this finds them rather than guessing at fixes. Nothing here writes.

const INDEX_NAME = "idx_records_bside_title_norm";

/** The join below matches a song's title against every B-side title in the
 * catalogue, which without an index is 135k x 135k comparisons. SQLite can
 * index the expression itself, turning that into a seek.
 *
 * Created on demand rather than during import, because a full import builds a
 * fresh table and renames the old one — taking this index with it, since
 * SQLite renames tables but not their indexes. So the name may still exist,
 * attached to the previous generation; PRAGMA tells us whether the LIVE table
 * has it, and the stale one is dropped before rebuilding. */
async function ensureIndex(): Promise<void> {
  const client = await getClient();
  const list = await client.execute(`PRAGMA index_list(records)`);
  const present = list.rows.some(
    (r) => String((r as unknown as { name: string }).name) === INDEX_NAME
  );
  if (present) return;
  await client.execute(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  await client.execute(`CREATE INDEX ${INDEX_NAME} ON records(lower(trim(b_side_title)))`);
}

export interface MatrixMismatch {
  song: string;
  artist: string | null;
  label: string | null;
  /** The song's own entry — where the matrix number is authoritative. */
  ownId: number;
  ownLabelNumber: string | null;
  ownMatrix: string;
  /** The entry carrying it as a B-side stub. */
  stubId: number;
  stubLabelNumber: string | null;
  stubMatrix: string;
  /** How much of the two matrix numbers agrees before they diverge. */
  sharedPrefix: string;
}

/** The leading run both values agree on, compared case-insensitively but
 * returned as written. The compiler's rule of thumb is that matrix numbers
 * agree through the letter-and-number stem ("DSR 1234") and diverge after it,
 * so showing the shared part makes the actual difference obvious. */
export function sharedPrefixOf(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  let i = 0;
  while (i < x.length && i < y.length && x[i].toLowerCase() === y[i].toLowerCase()) i++;
  return x.slice(0, i);
}

const MAX_ROWS = 500;

export async function findMatrixMismatchesUncached(): Promise<{
  rows: MatrixMismatch[];
  capped: boolean;
}> {
  await ensureIndex();
  const client = await getClient();

  // Both sides must actually carry a matrix number: a blank stub is an
  // omission, not the divergence being hunted. The label has to agree too,
  // since the same title on another label is a different record entirely.
  const res = await client.execute({
    sql: `SELECT a.id AS own_id, a.artist, a.title, a.matrix_number AS own_matrix,
                 a.label_number AS own_label_no, a.label,
                 b.id AS stub_id, b.b_side_matrix_number AS stub_matrix,
                 b.label_number AS stub_label_no
          FROM records a
          JOIN records b
            ON lower(trim(b.b_side_title)) = lower(trim(a.title))
           AND b.id <> a.id
           AND lower(trim(coalesce(b.b_side_artist, ''))) = lower(trim(coalesce(a.artist, '')))
           AND lower(trim(coalesce(b.label, ''))) = lower(trim(coalesce(a.label, '')))
          WHERE trim(coalesce(a.title, '')) <> ''
            AND trim(coalesce(a.matrix_number, '')) <> ''
            AND trim(coalesce(b.b_side_matrix_number, '')) <> ''
            AND lower(trim(b.b_side_matrix_number)) <> lower(trim(a.matrix_number))
          ORDER BY a.label, a.matrix_number
          LIMIT ?`,
    args: [MAX_ROWS + 1],
  });

  const all = res.rows.map((r) => {
    const x = r as unknown as Record<string, string | number | null>;
    const ownMatrix = String(x.own_matrix ?? "");
    const stubMatrix = String(x.stub_matrix ?? "");
    return {
      song: String(x.title ?? ""),
      artist: x.artist == null ? null : String(x.artist),
      label: x.label == null ? null : String(x.label),
      ownId: Number(x.own_id),
      ownLabelNumber: x.own_label_no == null ? null : String(x.own_label_no),
      ownMatrix,
      stubId: Number(x.stub_id),
      stubLabelNumber: x.stub_label_no == null ? null : String(x.stub_label_no),
      stubMatrix,
      sharedPrefix: sharedPrefixOf(ownMatrix, stubMatrix),
    };
  });

  return { rows: all.slice(0, MAX_ROWS), capped: all.length > MAX_ROWS };
}

// The join reads the whole catalogue, so hold the result until an upload or an
// edit changes something rather than recomputing it per page view.
export const findMatrixMismatches = unstable_cache(
  findMatrixMismatchesUncached,
  ["matrix-mismatches"],
  { tags: [CATALOGUE_TAG], revalidate: 3600 }
);
