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

function tracksOf(
  r: { artist: string | null; title: string | null; b_side_artist: string | null; b_side_title: string | null; label_number: string | null; b_side_label_number?: string | null; id: number },
  here: boolean
): Track[] {
  const out: Track[] = [];
  if (r.title?.trim()) {
    out.push({ labelNumber: r.label_number, artist: r.artist, title: r.title, recordId: r.id, here });
  }
  if (r.b_side_title?.trim()) {
    out.push({
      labelNumber: r.b_side_label_number ?? null,
      artist: r.b_side_artist,
      title: r.b_side_title,
      recordId: r.id,
      here,
    });
  }
  return out;
}

/** The complete contents of a physical release, gathered from every entry that
 * makes it up.
 *
 * A 12" or EP holds three or four songs, which the A-side/B-side format has to
 * split across two entries. Someone arriving from a search for one song sees
 * half the record with nothing to say the rest exists — so the whole thing is
 * listed here, including the sides shown above, because "what is actually on
 * this record" is the question being answered and a partial answer is what
 * caused the confusion in the first place.
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

  const tracks = [
    ...tracksOf(record, true),
    ...siblings.flatMap((s) => tracksOf({ ...s, b_side_label_number: null }, false)),
  ];

  return (
    <section className="frame-double bg-parchment/40 p-5 sm:p-6 mt-6">
      <h3 className="font-display text-lg text-ink mb-1">
        Full contents{base ? ` of ${base}` : " of this release"}
      </h3>
      <p className="font-body text-sm text-ink-soft mb-4">
        This record carries more sides than one entry can show, so its sides are catalogued
        separately. Everything on it:
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
              {t.labelNumber && (
                <span className="text-ink-soft text-xs"> ({t.labelNumber})</span>
              )}
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
