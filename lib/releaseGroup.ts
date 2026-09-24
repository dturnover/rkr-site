import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";
import { FLAG_RELEASE_GROUPING, isEnabled } from "@/lib/settings";

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

/** The release a row belongs to. Only rows carrying an explicit side marker
 * get one: a bare catalogue number is just a record, and treating it as the
 * base of a release would sweep in anything sharing that number. */
function releaseKeyOf(labelNumber: string | null | undefined): string | null {
  const base = deriveReleaseBase(labelNumber);
  return base ? normalize(base) : null;
}

export interface ReleaseSibling {
  id: number;
  label_number: string | null;
  artist: string | null;
  title: string | null;
  b_side_artist: string | null;
  b_side_title: string | null;
  b_side_label_number: string | null;
  matrix_number: string | null;
  b_side_matrix_number: string | null;
  format: string | null;
  year: string | null;
}

/** Catalogue numbers are not unique forever — a label re-launching a series
 * reuses them, so the same number can belong to unrelated records decades
 * apart. Matching on the number alone would present two unrelated records as
 * one release, which in a reference work is worse than showing nothing.
 *
 * So agreement is required on everything cheap that a genuine pair of sides
 * must share: the label, the pressing format, and the year. A reused number
 * from another era fails on year; a different format is a different record.
 *
 * The deliberate consequence is that inconsistent data (a year typo'd on one
 * side, a format left blank) shows no grouping rather than a wrong one. */
function agrees(a: string | null, b: string | null): boolean {
  return normalize(a ?? "") === normalize(b ?? "");
}

/** The number on a side marker: "GRED 266-B2" -> 2, "GRED 266-A" -> 0, and
 * null where there's no marker at all. */
function sideMarkerNumber(labelNumber: string | null | undefined): number | null {
  if (!deriveReleaseBase(labelNumber)) return null;
  const m = labelNumber!.trim().match(/[A-D](\d{0,2})$/i);
  if (!m) return null;
  return m[1] ? parseInt(m[1], 10) : 0;
}

/** Whether a set of label numbers describes a record with more than two sides.
 *
 * Plain A and B are just the two faces of any record, so a pair of entries
 * marked -A and -B proves nothing — they could as easily be two unrelated
 * records that happen to share a catalogue number. A SECOND numbered side
 * (A2, B2) is what can only exist when the release runs past two titles, and
 * that is the signal the compiler uses when entering them.
 *
 * Requiring it means an ambiguous pair is left alone rather than guessed at. */
function hasMultiSideMarker(labelNumbers: (string | null)[]): boolean {
  return labelNumbers.some((ln) => (sideMarkerNumber(ln) ?? 0) >= 2);
}

// The index that makes the sibling lookup a seek instead of a scan.
//
// This lookup used to be written as `label_number LIKE 'gred 266%'`, which
// LOOKS index-friendly — a prefix pattern with no leading wildcard is exactly
// the shape SQLite's LIKE optimisation is for. It never fired, for two
// independent reasons:
//
//   1. The pattern carried an `ESCAPE '\'` clause (added so a `%` or `_`
//      inside a catalogue number couldn't act as a wildcard). SQLite disables
//      the LIKE optimisation outright whenever ESCAPE is present.
//   2. LIKE is case-insensitive by default, so it can only use an index whose
//      collation is NOCASE. The import builds a plain BINARY index on
//      label_number, so even without the ESCAPE clause the optimisation
//      wouldn't have applied.
//
// The result was a full table scan — ~135,000 rows read — on EVERY view of a
// record whose catalogue number carries a side marker. Turso's query insights
// caught it at 68.1 million rows read across 502 executions, by far the most
// expensive statement on the site.
//
// A range scan over a normalised expression needs no escaping (the bounds are
// literal values, not a pattern) and no case folding at match time (the index
// stores the folded form), so it is always usable.
//
// Created on demand rather than during import, for the same reason as the
// matrix report's index: a full import builds a fresh table and renames the old
// one, and SQLite renames tables but NOT their indexes — so the name can
// survive attached to the previous generation. PRAGMA tells us whether the LIVE
// table has it; the stale one is dropped before rebuilding.
const INDEX_NAME = "idx_records_label_number_norm";
const INDEX_EXPR = "lower(trim(label_number))";

let indexEnsured: Promise<void> | null = null;

function ensureIndex(): Promise<void> {
  if (!indexEnsured) {
    indexEnsured = (async () => {
      const client = await getClient();
      const list = await client.execute(`PRAGMA index_list(records)`);
      const present = list.rows.some(
        (r) => String((r as unknown as { name: string }).name) === INDEX_NAME
      );
      if (present) return;
      await client.execute(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
      await client.execute(`CREATE INDEX ${INDEX_NAME} ON records(${INDEX_EXPR})`);
    })().catch((err) => {
      // Left unmemoised on failure so the next request tries again. The query
      // below is correct with or without the index, only slower, so a failure
      // here must not stop the page rendering.
      indexEnsured = null;
      throw err;
    });
  }
  return indexEnsured;
}

// Above every valid UTF-8 string, so `>= key AND < key + UPPER_BOUND` is
// exactly the set of strings beginning with `key`. U+10FFFF is the highest
// code point there is, so nothing sorts past it.
const UPPER_BOUND = "\u{10FFFF}";

// A 12" or EP runs to three or four sides — six at the very outside. If far
// more than that share a base number, the number is being reused rather than
// subdivided, and the whole group is suppressed rather than guessed at.
const MAX_GROUP = 6;

/** Other rows belonging to the same physical release as this one.
 *
 * Matched on a label-number prefix — expressed as a range over the normalised
 * column so an index can serve it (see INDEX_NAME above) — then filtered
 * exactly in JavaScript, since the prefix alone would also catch "GRED 2660"
 * when looking for "GRED 266". The label has to agree too, since catalogue
 * numbers are only unique within a label. */
export interface ReleaseAnchor {
  id: number;
  label_number: string | null;
  b_side_label_number: string | null;
  label: string | null;
  format: string | null;
  year: string | null;
}

export async function findReleaseSiblings(anchor: ReleaseAnchor): Promise<ReleaseSibling[]> {
  const { id: recordId, label_number: labelNumber, label, format, year } = anchor;
  const key = releaseKeyOf(labelNumber);
  if (!key) return [];

  // A missing index only costs speed, never correctness, so a failure to build
  // it must not take the record page down with it.
  try {
    await ensureIndex();
  } catch {
    // fall through and run the query unindexed
  }

  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT id, label_number, artist, title, matrix_number,
                 b_side_artist, b_side_title, b_side_label_number,
                 b_side_matrix_number, format, year
          FROM records
          WHERE ${INDEX_EXPR} >= ? AND ${INDEX_EXPR} < ?
            AND id <> ?
            AND (label IS ? OR lower(trim(label)) = lower(trim(?)))
          LIMIT 60`,
    args: [key, `${key}${UPPER_BOUND}`, recordId, label, label ?? ""],
  });

  const group = (res.rows as unknown as ReleaseSibling[]).filter(
    (r) =>
      // A prefix match alone would make GRED 2660 part of GRED 266.
      releaseKeyOf(r.label_number) === key &&
      agrees(r.format, format) &&
      agrees(r.year, year)
  );

  // Too many to be one record's sides: the number is reused, not subdivided.
  if (group.length + 1 > MAX_GROUP) return [];

  // Every side marker in play, from both the A and B columns of every entry.
  // Without a numbered one among them there is no evidence this is a release
  // with more than two titles, so leave it alone.
  const markers = [
    labelNumber,
    anchor.b_side_label_number,
    ...group.flatMap((r) => [r.label_number, r.b_side_label_number]),
  ];
  if (!hasMultiSideMarker(markers)) return [];

  return group;
}

const cachedSiblings = unstable_cache(findReleaseSiblings, ["release-siblings"], {
  tags: [CATALOGUE_TAG],
  // A day, to match the record page. Next serves the SHORTEST revalidate of a
  // page and every cache its render touches, so an hour here would silently
  // cap all 135k record pages at an hour too. Every write flushes this by
  // tag, so freshness never depended on the window.
  revalidate: 86_400,
});

/** What the record page calls.
 *
 * Grouping is an ADDITION to a page that was complete without it, so it must
 * never be the reason that page fails. Two ways out are guaranteed: an admin
 * can switch the whole feature off without a deploy (lib/settings.ts), and any
 * error here degrades to showing no panel rather than propagating. Either way
 * the record itself still renders exactly as it did before this existed. */
export async function getReleaseSiblings(anchor: ReleaseAnchor): Promise<ReleaseSibling[]> {
  try {
    if (!(await isEnabled(FLAG_RELEASE_GROUPING))) return [];
    return await cachedSiblings(anchor);
  } catch {
    return [];
  }
}


export interface StubMismatch {
  siblingId: number;
  siblingLabelNumber: string | null;
  field: "matrix number" | "label number";
  /** What this entry says, as the song's own entry. */
  here: string | null;
  /** What the other entry says, referring to this song as its B-side. */
  there: string | null;
}

/** Where another entry in the same release refers to THIS song as its B side
 * but records it differently.
 *
 * The same song is stored twice — once as its own entry, once as a stub on the
 * back of its pair — so editing one leaves the other stale. Worse, the stubs
 * were often filled in with partial matrix numbers before the full matrix was
 * understood to matter, so many disagree for historical reasons rather than
 * because anyone edited anything.
 *
 * This only ever REPORTS. Matching stubs to entries is exactly what the
 * compiler describes as unreliable in his own data, so nothing is copied
 * automatically — a wrong match that merely shows a question costs a glance,
 * while a wrong match that rewrites a matrix number damages the reference. */
export function findStubMismatches(
  record: { title: string | null; matrix_number: string | null; label_number: string | null },
  siblings: ReleaseSibling[]
): StubMismatch[] {
  const same = (a: string | null, b: string | null) =>
    normalize(a ?? "") === normalize(b ?? "");
  const out: StubMismatch[] = [];

  for (const s of siblings) {
    // Only entries actually pointing at this song.
    if (!record.title?.trim() || !same(s.b_side_title, record.title)) continue;

    const pairs: [StubMismatch["field"], string | null, string | null][] = [
      ["matrix number", record.matrix_number, s.b_side_matrix_number],
      ["label number", record.label_number, s.b_side_label_number],
    ];
    for (const [field, here, there] of pairs) {
      // Nothing to say when this entry has no value of its own to compare.
      if (!here?.trim()) continue;
      if (same(here, there)) continue;
      out.push({ siblingId: s.id, siblingLabelNumber: s.label_number, field, here, there });
    }
  }
  return out;
}
