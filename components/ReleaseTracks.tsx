import Link from "next/link";
import type { ReleaseSibling } from "@/lib/releaseGroup";
import type { RecordDetail } from "@/lib/queries/records";

interface Track {
  labelNumber: string | null;
  artist: string | null;
  title: string;
  recordId: number;
  here: boolean;
}

interface SidedRecord {
  id: number;
  artist: string | null;
  title: string | null;
  label_number: string | null;
  b_side_artist: string | null;
  b_side_title: string | null;
  b_side_label_number: string | null;
}

function tracksOf(r: SidedRecord, here: boolean): Track[] {
  const out: Track[] = [];
  if (r.title?.trim()) {
    out.push({ labelNumber: r.label_number, artist: r.artist, title: r.title, recordId: r.id, here });
  }
  if (r.b_side_title?.trim()) {
    out.push({
      labelNumber: r.b_side_label_number,
      artist: r.b_side_artist,
      title: r.b_side_title,
      recordId: r.id,
      here,
    });
  }
  return out;
}

function key(t: Track): string {
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(t.artist)}|${norm(t.title)}`;
}

/** Orders tracks by their side marker — A, A2, A3, B, B1, B2 — so the listing
 * reads in the order the sides are labelled rather than in whatever order the
 * entries happened to be found. Anything without a side marker sorts last,
 * keeping its relative position. */
function sideRank(labelNumber: string | null): [string, number] {
  const m = labelNumber?.trim().match(/([A-D])(\d{0,2})$/i);
  if (!m) return ["Z", 999];
  return [m[1].toUpperCase(), m[2] ? parseInt(m[2], 10) : 0];
}

/** The complete contents of a physical release, gathered from every entry that
 * makes it up.
 *
 * A 12" or EP holds three or four songs, which the A-side/B-side format has to
 * split across several entries. Those entries PAIR tracks rather than
 * describing one physical side each, so the same song turns up as the A side
 * of one entry and the B side of another — listing them raw gave eight lines
 * for a four-track record, with one song repeated three times. Each distinct
 * song is therefore shown once, keeping whichever occurrence carries its side
 * number, and marked when it's one of the two already displayed above.
 */
export default function ReleaseTracks({
  record,
  siblings,
  base,
}: {
  record: RecordDetail;
  siblings: ReleaseSibling[];
  base: string | null;
}) {
  if (siblings.length === 0) return null;

  const all = [...tracksOf(record, true), ...siblings.flatMap((s) => tracksOf(s, false))];

  // One entry per distinct song. Where the same song appears more than once,
  // prefer the occurrence that names its side, and remember if any of them was
  // shown on this page.
  const byTrack = new Map<string, Track>();
  for (const t of all) {
    const k = key(t);
    const existing = byTrack.get(k);
    if (!existing) {
      byTrack.set(k, { ...t });
      continue;
    }
    if (!existing.labelNumber && t.labelNumber) {
      byTrack.set(k, { ...t, here: existing.here || t.here });
    } else if (t.here) {
      existing.here = true;
    }
  }

  const tracks = [...byTrack.values()].sort((a, b) => {
    const [al, an] = sideRank(a.labelNumber);
    const [bl, bn] = sideRank(b.labelNumber);
    return al === bl ? an - bn : al < bl ? -1 : 1;
  });

  return (
    <section className="frame-double bg-parchment/40 p-5 sm:p-6 mt-6">
      <h3 className="font-display text-lg text-ink mb-1">
        Full contents{base ? ` of ${base}` : " of this release"}
      </h3>
      <p className="font-body text-sm text-ink-soft mb-4">
        This record carries more sides than one entry can show, so its sides are catalogued
        separately. All {tracks.length} tracks on it:
      </p>

      <ol className="space-y-2 font-body text-sm">
        {tracks.map((t, i) => (
          <li key={`${t.recordId}-${i}`} className="flex gap-3">
            <span className="text-ink-soft tabular-nums">{i + 1}.</span>
            <span className="flex-1">
              <span className="text-ink">
                {t.artist ? `${t.artist} — ` : ""}
                <span className="italic">{t.title}</span>
              </span>
              {t.labelNumber && <span className="text-ink-soft text-xs"> ({t.labelNumber})</span>}
              {t.here ? (
                <span className="text-ink-soft text-xs"> &middot; shown above</span>
              ) : (
                <>
                  {" "}
                  <Link
                    href={`/records/${t.recordId}`}
                    prefetch={false}
                    className="text-link text-xs hover:text-rasta-red"
                  >
                    view entry
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
