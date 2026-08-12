import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// Reuniting the sides of a multi-track release.
//
// The catalogue models a record as one A side and one B side, which is exactly
// right for a 7" single and is how the source spreadsheet is built. A 12" or an
// EP, though, carries three or four songs — so it is entered as TWO rows
// sharing a base label number, each carrying a side suffix: GRED 266-A and
// GRED 266-B.
//
// That splits a single physical record in two everywhere it's viewed. Searching
// the base number finds both halves and looks complete; searching a song title
// finds only the half it's on, so the visitor sees two of the four tracks and
// has no way to know the rest exist.
//
// Rather than change how the data is entered — the compiler's Excel file can't
// express a four-track record, and a new entry format would be a permanent tax
// on every future addition — the sides are rejoined at display time by deriving
// the base number and looking for its siblings. Nothing about the spreadsheet
// changes, and the fix applies retroactively to every record already entered.

/** Strips a side suffix from a label number: "GRED 266-A" -> "GRED 266".
 * Returns null when there's no suffix to strip, so callers can tell "this is
 * already a base number" from "this is one side of one".
 *
 * Conservative on purpose. A letter is only treated as a side marker when it
 * follows a separator, or follows a digit — otherwise a catalogue number that
 * simply ends in a letter would be silently truncated, and every record on that
 * label would look like a sibling of every other. */
export function deriveReleaseBase(labelNumber: string | null | undefined): string | null {
  if (!labelNumber) return null;
  const trimmed = labelNumber.trim();
  // A side marker is a letter, optionally numbered: -A, -B, -A1, -B2. The
  // numbered form is what a 12" actually uses, since four sides of music need
  // more than two names (observed: GRED 266-A alongside GRED 266-B2).
  const m = trimmed.match(/^(.+?)([\s._\-/]+)?([A-D]{1,2}\d{0,2})$/i);
  if (!m) return null;

  const head = m[1];
  const separator = m[2];
  if (!separator && !/\d$/.test(head)) return null;

  const base = head.trim().replace(/[\s._\-/]+$/, "");
  // A one-character base is meaningless and would match half the catalogue.
  return base.length >= 2 ? base : null;
}

/** The comparison form of a label number — case and spacing are inconsistent
 * across decades of entry, so neither can be trusted for matching. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The base number a row belongs to, whether or not it carries a suffix, so a
 * suffixed row and an unsuffixed one on the same release group together. */
function releaseKeyOf(labelNumber: string | null | undefined): string | null {
  if (!labelNumber || !labelNumber.trim()) return null;
  return normalize(deriveReleaseBase(labelNumber) ?? labelNumber);
}

export interface ReleaseSibling {
  id: number;
  label_number: string | null;
  artist: string | null;
  title: string | null;
  b_side_artist: string | null;
  b_side_title: string | null;
}

// LIKE treats these as wildcards, so a label number containing one would match
// far more than it should. Escaped with a character that can't appear in a
// catalogue number.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const MAX_SIBLINGS = 12;

/** Other rows belonging to the same physical release as this one.
 *
 * Matched on a label-number prefix, which an index can serve (no leading
 * wildcard), then filtered exactly in JavaScript — the prefix alone would also
 * catch "GRED 2660" when looking for "GRED 266". The label has to agree too,
 * since catalogue numbers are only unique within a label. */
export async function findReleaseSiblings(
  recordId: number,
  labelNumber: string | null,
  label: string | null
): Promise<ReleaseSibling[]> {
  const key = releaseKeyOf(labelNumber);
  if (!key) return [];

  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT id, label_number, artist, title, b_side_artist, b_side_title
          FROM records
          WHERE label_number LIKE ? ESCAPE '\\'
            AND id <> ?
            AND (label IS ? OR lower(trim(label)) = lower(trim(?)))
          LIMIT 60`,
    args: [`${escapeLike(key)}%`, recordId, label, label ?? ""],
  });

  return (res.rows as unknown as ReleaseSibling[])
    .filter((r) => releaseKeyOf(r.label_number) === key)
    .slice(0, MAX_SIBLINGS);
}

export const getReleaseSiblings = unstable_cache(findReleaseSiblings, ["release-siblings"], {
  tags: [CATALOGUE_TAG],
  revalidate: 3600,
});
