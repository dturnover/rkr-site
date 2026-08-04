import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/requireAdmin";
import { detectTypos, type TypoField } from "@/lib/typos";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const FIELD_LABEL: Record<TypoField, string> = {
  country: "Country",
  format: "Format",
  genre: "Genre",
};

function Banner({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" }) {
  const colors = tone === "good" ? "border-rasta-green text-rasta-green" : "border-error text-error";
  return <div className={`border-2 ${colors} bg-paper px-4 py-3 font-body mb-6`}>{children}</div>;
}

const btn =
  "font-body text-xs tracking-wide px-3 py-1.5 border border-frame text-ink hover:bg-parchment-deep transition-colors";

export default async function TyposPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");
  // Admin only — editors can't review suggested corrections.
  if (session.role !== "admin") redirect("/admin");

  const sp = await searchParams;
  const applied = first(sp.applied);
  const dismissed = first(sp.dismissed) === "1";
  const error = first(sp.error);

  const suggestions = await detectTypos();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink">Suggested Corrections</h1>
        <Link href="/admin" className="font-body text-sm text-ink-soft hover:text-rasta-red">
          &larr; Back to Admin
        </Link>
      </div>

      {applied && (
        <Banner tone="good">
          Applied the correction to {Number(applied).toLocaleString()} record
          {Number(applied) === 1 ? "" : "s"}.
        </Banner>
      )}
      {dismissed && <Banner tone="good">Suggestion dismissed — it won&rsquo;t show again.</Banner>}
      {error === "apply-failed" && <Banner tone="bad">Could not apply that correction.</Banner>}
      {error === "dismiss-failed" && <Banner tone="bad">Could not dismiss that suggestion.</Banner>}
      {error === "invalid" && <Banner tone="bad">That request was invalid.</Banner>}

      <p className="font-body text-sm text-ink-soft mb-6">
        Safe cleanups in the catalogue&rsquo;s fixed categories (Country, Format, Genre):{" "}
        <span className="text-ink">Formatting</span> = the same value written inconsistently
        (e.g. <em>dancehall</em> &rarr; <em>Dancehall</em>); <span className="text-ink">Spelling</span>
        {" "}= a known misspelling (e.g. <em>Scandanavia</em> &rarr; <em>Scandinavia</em>). Each fix
        applies to every record with that value and is kept across catalogue re-imports.
      </p>

      {suggestions.length === 0 ? (
        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">No likely misspellings found. 🎉</p>
        </section>
      ) : (
        <div className="overflow-x-auto border border-paper-stain">
          <table className="w-full min-w-[640px] text-sm bg-paper">
            <thead>
              <tr className="bg-parchment-deep border-b-2 border-frame font-body text-ink">
                <th className="text-left font-semibold px-3 py-2">Field</th>
                <th className="text-left font-semibold px-3 py-2">Current value</th>
                <th className="text-left font-semibold px-3 py-2">Suggested</th>
                <th className="text-left font-semibold px-3 py-2">Type</th>
                <th className="text-left font-semibold px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="font-body">
              {suggestions.map((s, i) => (
                <tr key={`${s.field}:${s.current}`} className={`border-b border-paper-stain/60 ${i % 2 ? "bg-parchment/30" : ""}`}>
                  <td className="px-3 py-2 align-top text-ink-soft">{FIELD_LABEL[s.field]}</td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-ink">{s.current}</span>{" "}
                    <span className="text-ink-soft text-xs">
                      ({s.currentCount.toLocaleString()} rec{s.currentCount === 1 ? "" : "s"})
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-rasta-green">{s.suggested}</span>{" "}
                    <span className="text-ink-soft text-xs">({s.suggestedCount.toLocaleString()})</span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-xs uppercase tracking-wide text-ink-soft">
                      {s.kind === "spelling" ? "Spelling" : "Formatting"}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex gap-2">
                      <form action="/api/admin/typos/apply" method="POST">
                        <input type="hidden" name="field" value={s.field} />
                        <input type="hidden" name="current" value={s.current} />
                        <input type="hidden" name="suggested" value={s.suggested} />
                        <button type="submit" className={`${btn} border-rasta-green text-rasta-green hover:bg-rasta-green/10`}>
                          Apply fix
                        </button>
                      </form>
                      <form action="/api/admin/typos/dismiss" method="POST">
                        <input type="hidden" name="field" value={s.field} />
                        <input type="hidden" name="current" value={s.current} />
                        <button type="submit" className={btn}>
                          Dismiss
                        </button>
                      </form>
                    </div>
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
