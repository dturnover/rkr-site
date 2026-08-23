import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";
import { FLAG_BSIDE_ENTRY_LINK, isEnabled } from "@/lib/settings";

// Finding the entry a B side has in its own right.
//
// The catalogue stores a song twice when it is the flip of another record:
// once as an entry of its own, where it is the A side and carries a producer,
// riddim, genre and year — and once as a six-column stub in the b_side_*
// columns of its pair. An editor correcting a date on the A side can SEE the
// same song sitting in the B-side block, but the B side has no year field to
// correct; the fix belongs on that song's own entry, which until now had to be
// found by searching for it by hand.
//
// So: given a record, find the entry whose A side is this record's B side.
//
// The matching rule is deliberately NOT invented here. lib/queries/
// matrixMismatches.ts already had to answer exactly this question — "is this
// B-side stub the same song as that entry?" — and its answer has already been
// corrected once in the field: matching on label, artist and title alone
// paired a Jamaican side with a UK side, the same song on the same label but
// genuinely different records (see the commit that added country/format/year
// to that join). This uses the same agreement rule, so the two can never
// disagree about what counts as the same song.
//
// Note what is NOT used: the matrix number. That is the one field known to
// disagree between a stub and its entry — early stubs carry only a partial
// matrix number, which is the entire subject of the /admin/matrix worklist —
// so matching on it would miss exactly the pairs an editor most wants to
// reach, and a partial value could collide with an unrelated record's full one.

export interface BSideEntry {
  id: number;
  artist: string | null;
  title: string | null;
  label_number: string | null;
  matrix_number: string | null;
}

/** The stub side of the comparison: the six B-side columns plus the facts that
 * describe the pressing rather than either song. */
export interface BSideAnchor {
  id: number;
  b_side_artist: string | null;
  b_side_title: string | null;
  label: string | null;
  country: string | null;
  format: string | null;
  year: string | null;
}

const norm = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

/** Exported uncached so the matching rule can be exercised directly against a
 * fixture database (scripts/test-bside-entry.ts) without Next's data cache in
 * the way — the same reason findMatrixMismatchesUncached is exported. */
export async function findBSideEntryUncached(anchor: BSideAnchor): Promise<BSideEntry | null> {
  // No title, nothing to match on. An artist alone is not a song.
  const title = norm(anchor.b_side_title);
  if (!title) return null;

  const client = await getClient();

  // Driven off artist_norm, which is indexed (lib/db/ddl.ts buildIndexStatements),
  // so this seeks to one artist's records and filters those — rather than
  // scanning 135k rows, which is what matching on title first would cost since
  // `title` carries no index. artist_norm is stored exactly as trim()'d then
  // lowercased (see importCsv's NORM_SOURCE_FIELDS and the overlay's NORM_MAP),
  // which is the same shape as norm() above.
  //
  // `IS` rather than `=` so a blank B-side artist binds as NULL and matches the
  // entries whose artist is likewise blank. `=` would never match NULL and the
  // lookup would silently return nothing for every same-artist flip side.
  const artistNorm = norm(anchor.b_side_artist) || null;

  // LIMIT 3 is enough to tell "exactly one" from "more than one" — see below.
  const res = await client.execute({
    sql: `SELECT id, artist, title, label_number, matrix_number
            FROM records
           WHERE artist_norm IS ?
             AND lower(trim(coalesce(title, ''))) = ?
             AND lower(trim(coalesce(label, ''))) = ?
             AND lower(trim(coalesce(country, ''))) = ?
             AND lower(trim(coalesce(format, ''))) = ?
             AND lower(trim(coalesce(year, ''))) = ?
             AND id <> ?
           LIMIT 3`,
    args: [
      artistNorm,
      title,
      norm(anchor.label),
      norm(anchor.country),
      norm(anchor.format),
      norm(anchor.year),
      anchor.id,
    ],
  });

  // Exactly one match, or nothing. Two entries answering to the same song on
  // the same pressing means the catalogue cannot say which one this stub is —
  // and sending an editor to a coin-flip guess is worse than sending them
  // nowhere, because the wrong edit would land on a real record and look
  // deliberate. The handful of genuine duplicates in the catalogue are exactly
  // the case this protects against.
  if (res.rows.length !== 1) return null;
  return res.rows[0] as unknown as BSideEntry;
}

const cached = unstable_cache(findBSideEntryUncached, ["b-side-entry"], {
  tags: [CATALOGUE_TAG],
  revalidate: 3600,
});

/** What the record page calls. Like release grouping, this is an addition to a
 * page that was complete without it, so it can never be the reason that page
 * fails: an admin can switch it off without a deploy, and any error degrades
 * to "no link" rather than propagating. */
export async function findBSideEntry(anchor: BSideAnchor): Promise<BSideEntry | null> {
  try {
    if (!(await isEnabled(FLAG_BSIDE_ENTRY_LINK))) return null;
    return await cached(anchor);
  } catch {
    return null;
  }
}
