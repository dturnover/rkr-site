import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/requireAdmin";
import { listFieldEdits } from "@/lib/editor/overlay";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const FIELD_LABEL: Record<string, string> = {
  artist: "Artist", artist_credit: "Artist Credit", title: "Title", title_credit: "Title Credit",
  matrix_number: "Matrix No.", label_number: "Label No.", label: "Label", country: "Country",
  format: "Format", producer: "Producer", year: "Year", riddim: "Riddim", version: "Version",
  genre: "Genre", notes: "Notes", song_origin: "Song Origin", additions: "Additions",
  b_side_artist: "B-Side Artist", b_side_artist_credit: "B-Side Artist Credit", b_side_title: "B-Side Title",
  b_side_title_credit: "B-Side Title Credit", b_side_matrix_number: "B-Side Matrix No.", b_side_label_number: "B-Side Label No.",
};

function Banner({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" }) {
  const colors = tone === "good" ? "border-rasta-green text-rasta-green" : "border-rasta-gold text-ink";
  return <div className={`border-2 ${colors} bg-paper px-4 py-3 font-body mb-6`}>{children}</div>;
}

const dash = <span className="text-ink-soft">&mdash;</span>;

export default async function EditsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");
  if (session.role !== "admin") redirect("/admin"); // admin only

  const removed = first((await searchParams).removed);
  const edits = await listFieldEdits();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink">Editor Overrides</h1>
        <Link href="/admin" className="font-body text-sm text-ink-soft hover:text-rasta-red">
          &larr; Back to Admin
        </Link>
      </div>

      {removed === "reverted" && <Banner tone="good">Override removed and the record reverted to the spreadsheet value.</Banner>}
      {removed === "pending" && (
        <Banner tone="warn">
          Override removed. The live value will return to the spreadsheet value on the next upload.
        </Banner>
      )}

      <p className="font-body text-sm text-ink-soft mb-6">
        Every field correction made on the site (including approved typo fixes) is stored here
        permanently, so it survives &mdash; and is re-applied on top of &mdash; each of dad&rsquo;s
        spreadsheet uploads. <strong>Base</strong> is dad&rsquo;s value when the correction was made:
        while his upload still matches it, the correction wins; if he later changes that field to
        something genuinely new, his new value wins instead. Removing an override reverts the field
        to dad&rsquo;s value.
      </p>

      {edits.length === 0 ? (
        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">No field overrides yet.</p>
        </section>
      ) : (
        <div className="overflow-x-auto border border-paper-stain">
          <table className="w-full min-w-[760px] text-sm bg-paper">
            <thead>
              <tr className="bg-parchment-deep border-b-2 border-frame font-body text-ink">
                <th className="text-left font-semibold px-3 py-2">Record</th>
                <th className="text-left font-semibold px-3 py-2">Field</th>
                <th className="text-left font-semibold px-3 py-2">Base (spreadsheet)</th>
                <th className="text-left font-semibold px-3 py-2">Corrected to</th>
                <th className="text-left font-semibold px-3 py-2">By</th>
                <th className="text-left font-semibold px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="font-body">
              {edits.map((e) => (
                <tr key={`${e.record_key}:${e.field}`} className="border-b border-paper-stain/60 align-top">
                  <td className="px-3 py-2 text-ink">
                    {e.record_id != null ? (
                      <Link href={`/records/${e.record_id}`} className="text-link underline hover:text-rasta-red">
                        {e.record_label || `record ${e.record_id}`}
                      </Link>
                    ) : (
                      e.record_label || <span className="text-ink-soft text-xs">{e.record_key}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{FIELD_LABEL[e.field] ?? e.field}</td>
                  <td className="px-3 py-2">
                    {e.has_base ? (e.base_value ? <span className="text-ink">{e.base_value}</span> : <span className="text-ink-soft italic">(blank)</span>) : <span className="text-ink-soft text-xs italic">unknown</span>}
                  </td>
                  <td className="px-3 py-2 text-rasta-green">{e.value ?? dash}</td>
                  <td className="px-3 py-2 text-ink-soft text-xs">{e.editor_name ?? dash}</td>
                  <td className="px-3 py-2">
                    <form action="/api/admin/edits" method="POST">
                      <input type="hidden" name="action" value="remove" />
                      <input type="hidden" name="record_key" value={e.record_key} />
                      <input type="hidden" name="field" value={e.field} />
                      <button
                        type="submit"
                        className="font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink whitespace-nowrap"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
