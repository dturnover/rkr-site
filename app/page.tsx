import Link from "next/link";
import { FACET_ORDER, FACETS } from "@/lib/facetConfig";
import { getDatabaseStatus } from "@/lib/import/atomicSwap";

// The catalogue can change at any time via an admin CSV upload without a
// redeploy, so this page (which has no cookies/searchParams to otherwise
// force dynamic rendering) must not be statically cached at build time.
export const dynamic = "force-dynamic";

const TILE_ICONS: Record<string, string> = {
  artists: "🎤",
  countries: "🗺",
  years: "📅",
  formats: "💿",
  labels: "🏷",
  producers: "🎛",
  riddims: "🥁",
  genres: "🎼",
  origins: "✎",
};

export default async function Home() {
  const status = await getDatabaseStatus();

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <section className="text-center max-w-2xl mx-auto">
        <p className="font-body text-ink leading-relaxed">
          Compiled over decades by Michael Turner &amp; Robert Schoenfeld,{" "}
          <em>Roots Knotty Roots</em> is the most comprehensive discography of
          Jamaican music ever assembled &mdash; every 7&Prime;, 10&Prime;, and 12&Prime; single,
          from calypso and mento through ska, rocksteady, reggae and dancehall.
          This site puts the entire catalogue online, free, for good.
        </p>
        {status.hasDatabase && (
          <p className="font-body text-xs text-ink-soft mt-3">
            {status.rowCount.toLocaleString()} tracks in the catalogue
            {status.lastUpdated
              ? ` · last updated ${new Date(status.lastUpdated).toLocaleDateString()}`
              : ""}
          </p>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl text-center text-ink mb-6">Browse the Catalogue</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {FACET_ORDER.map((slug) => (
            <Link
              key={slug}
              href={`/browse/${slug}`}
              className="frame-double bg-paper flex flex-col items-center justify-center gap-2 py-8 hover:bg-parchment-deep/50 transition-colors"
            >
              <span className="text-3xl" aria-hidden>
                {TILE_ICONS[slug]}
              </span>
              <span className="font-display text-lg text-ink">{FACETS[slug].label}</span>
            </Link>
          ))}
        </div>
      </section>

      {!status.hasDatabase && (
        <p className="text-center font-body text-error">
          No data has been imported yet. Run <code>npm run import -- --file=...</code>{" "}
          to load the catalogue.
        </p>
      )}
    </div>
  );
}
