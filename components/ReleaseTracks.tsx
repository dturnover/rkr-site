import Link from "next/link";
import type { ReleaseSibling } from "@/lib/releaseGroup";

function songs(s: ReleaseSibling): { artist: string | null; title: string }[] {
  const out: { artist: string | null; title: string }[] = [];
  if (s.title?.trim()) out.push({ artist: s.artist, title: s.title });
  if (s.b_side_title?.trim()) out.push({ artist: s.b_side_artist, title: s.b_side_title });
  return out;
}

/** Shown on a record page when the same physical release has more sides
 * entered separately — a 12" or EP carrying three or four songs, which the
 * A-side/B-side format has to split across two rows.
 *
 * Without this the visitor sees two songs and nothing to suggest the record
 * holds more, which is how someone arriving from a search for one track ends
 * up with a half-picture of what they're holding.
 */
export default function ReleaseTracks({
  siblings,
  labelNumber,
}: {
  siblings: ReleaseSibling[];
  labelNumber: string | null;
}) {
  if (siblings.length === 0) return null;

  return (
    <section className="frame-double bg-parchment/40 p-5 sm:p-6 mt-6">
      <h3 className="font-display text-lg text-ink mb-1">More of this release</h3>
      <p className="font-body text-sm text-ink-soft mb-4">
        {labelNumber ? (
          <>
            This record carries more sides than one entry can show. The rest of{" "}
            <strong className="text-ink">{labelNumber}</strong>:
          </>
        ) : (
          <>This record carries more sides than one entry can show. The rest of it:</>
        )}
      </p>

      <ul className="space-y-2.5 font-body text-sm">
        {siblings.map((s) => (
          <li key={s.id}>
            <Link
              href={`/records/${s.id}`}
              prefetch={false}
              className="text-link hover:text-rasta-red"
            >
              {s.label_number || `record ${s.id}`}
            </Link>
            <span className="text-ink-soft">
              {" "}
              &mdash;{" "}
              {songs(s)
                .map((t) => (t.artist ? `${t.artist}, “${t.title}”` : `“${t.title}”`))
                .join(" · ") || "no titles recorded"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
