import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/requireAdmin";
import { findMatrixMismatches, type MatrixMismatch } from "@/lib/queries/matrixMismatches";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// The join behind this reads the whole catalogue; give it room on a cold cache.
export const maxDuration = 300;

/** Shows the agreed stem in grey and the divergence in red, so the eye lands
 * on the part that differs rather than reading two codes character by
 * character. */
function Matrix({ value, shared }: { value: string; shared: string }) {
  const tail = value.slice(shared.length);
  return (
    <span className="font-mono text-xs whitespace-nowrap">
      <span className="text-ink-soft">{shared}</span>
      <span className="text-error font-semibold">{tail || " —"}</span>
    </span>
  );
}

function Row({ m }: { m: MatrixMismatch }) {
  return (
    <tr className="border-b border-paper-stain/60 align-top">
      <td className="px-3 py-2 text-ink">
        {m.artist && <span className="text-ink-soft">{m.artist} &mdash; </span>}
        {m.song}
        <span className="text-ink-soft text-xs block">
          {[m.label, m.country, m.year, m.format && `${m.format}"`].filter(Boolean).join(" · ")}
        </span>
      </td>
      <td className="px-3 py-2">
        <Link href={`/records/${m.ownId}`} className="text-link underline hover:text-rasta-red">
          {m.ownLabelNumber || `#${m.ownId}`}
        </Link>
        <span className="block mt-0.5">
          <Matrix value={m.ownMatrix} shared={m.sharedPrefix} />
        </span>
      </td>
      <td className="px-3 py-2">
        <Link href={`/records/${m.stubId}`} className="text-link underline hover:text-rasta-red">
          {m.stubLabelNumber || `#${m.stubId}`}
        </Link>
        <span className="block mt-0.5">
          <Matrix value={m.stubMatrix} shared={m.sharedPrefix} />
        </span>
      </td>
    </tr>
  );
}

export default async function MatrixMismatchPage() {
  const session = await getSession();
  if (!session) redirect("/admin");
  if (session.role !== "admin") redirect("/admin");

  const { rows, capped } = await findMatrixMismatches();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink">Mismatched Matrix Numbers</h1>
        <Link href="/admin" className="font-body text-sm text-ink-soft hover:text-rasta-red">
          &larr; Back to Admin
        </Link>
      </div>

      <p className="font-body text-sm text-ink-soft mb-6">
        Songs whose matrix number is written one way on their own entry and another way where they
        appear as a B-side. The part both agree on is grey; the divergence is red. Usually
        that&rsquo;s an early partial entry rather than a mistake. Nothing is changed here
        &mdash; open either entry to correct it.
      </p>

      {rows.length === 0 ? (
        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">
            No divergences found. Every song carrying a matrix number on its own entry matches the
            matrix recorded where it appears as a B-side.
          </p>
        </section>
      ) : (
        <>
          <p className="font-body text-sm text-ink mb-3">
            <strong>{rows.length.toLocaleString()}</strong>
            {capped ? "+" : ""} to check
            {capped && (
              <span className="text-ink-soft">
                {" "}
                &mdash; showing the first {rows.length.toLocaleString()}; more will appear as these
                are cleared.
              </span>
            )}
          </p>
          <div className="overflow-x-auto border border-paper-stain">
            <table className="w-full min-w-[720px] text-sm bg-paper">
              <thead>
                <tr className="bg-parchment-deep border-b-2 border-frame text-left font-body font-semibold text-ink">
                  <th className="px-3 py-2">Song</th>
                  <th className="px-3 py-2">Its own entry</th>
                  <th className="px-3 py-2">Listed as a B-side on</th>
                </tr>
              </thead>
              <tbody className="font-body">
                {rows.map((m) => (
                  <Row key={`${m.ownId}-${m.stubId}`} m={m} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
