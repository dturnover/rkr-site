import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/requireAdmin";
import { listCrawlBlocks } from "@/lib/crawlGuard";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default async function TrafficPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");
  if (session.role !== "admin") redirect("/admin");

  const cleared = first((await searchParams).cleared) === "1";
  const blocks = await listCrawlBlocks();
  const now = Date.now();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink">Bulk Copying</h1>
        <Link href="/admin" className="font-body text-sm text-ink-soft hover:text-rasta-red">
          &larr; Back to Admin
        </Link>
      </div>

      {cleared && (
        <div className="border-2 border-rasta-green text-rasta-green bg-paper px-4 py-3 font-body mb-6">
          Block lifted. That address can browse normally again.
        </div>
      )}

      <p className="font-body text-sm text-ink-soft mb-6">
        The catalogue is public on purpose &mdash; that&rsquo;s what makes it findable &mdash; so
        the only thing guarded is <strong>speed</strong>. A connection reading far faster than any
        person could is warned, and if it keeps going it&rsquo;s paused for a few minutes.
        Search engines are never limited, blocks always expire on their own, and if the check
        fails for any reason the site stays open. Anyone paused is shown how to get in touch.
      </p>

      {blocks.length === 0 ? (
        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">
            Nothing has been paused. Either nobody has tried to take the catalogue wholesale, or
            they haven&rsquo;t tried fast enough to notice.
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto border border-paper-stain">
          <table className="w-full min-w-[760px] text-sm bg-paper">
            <thead>
              <tr className="bg-parchment-deep border-b-2 border-frame text-left font-body font-semibold text-ink">
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Times</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2">Identified as</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="font-body">
              {blocks.map((b) => {
                const active = b.blocked_until > now;
                return (
                  <tr key={b.ip} className="border-b border-paper-stain/60 align-top">
                    <td className="px-3 py-2 text-ink font-mono text-xs">{b.ip}</td>
                    <td className="px-3 py-2">
                      {active ? (
                        <span className="text-error">
                          paused, {Math.ceil((b.blocked_until - now) / 60_000)} min left
                        </span>
                      ) : (
                        <span className="text-ink-soft">expired</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{b.strikes}</td>
                    <td className="px-3 py-2 text-ink-soft text-xs">{when(b.last_seen)}</td>
                    <td className="px-3 py-2 text-ink-soft text-xs break-all max-w-xs">
                      {b.user_agent || <span className="italic">not given</span>}
                    </td>
                    <td className="px-3 py-2">
                      {active && (
                        <form action="/api/admin/traffic" method="POST">
                          <input type="hidden" name="ip" value={b.ip} />
                          <button
                            type="submit"
                            className="font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink whitespace-nowrap"
                          >
                            Let them back in
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
