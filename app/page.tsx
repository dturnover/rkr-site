import Link from "next/link";
import { Suspense } from "react";
// import { FACET_ORDER, FACETS } from "@/lib/facetConfig"; // see "Browse the Catalogue" below
import { getDatabaseStatus } from "@/lib/import/atomicSwap";
import HeaderSearchForm from "@/components/HeaderSearchForm";
import GuideContent from "@/components/GuideContent";
import { PROSE_CLASS } from "@/components/ProsePage";

// The catalogue can change at any time via an admin CSV upload without a
// redeploy, so this page (which has no cookies/searchParams to otherwise
// force dynamic rendering) must not be statically cached at build time.
export const dynamic = "force-dynamic";

// const TILE_ICONS: Record<string, string> = {
//   artists: "🎤",
//   countries: "🗺",
//   years: "📅",
//   formats: "💿",
//   labels: "🏷",
//   producers: "🎛",
//   riddims: "🥁",
//   genres: "🎼",
//   origins: "✎",
// };

export default async function Home() {
  const status = await getDatabaseStatus();

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      {/* Search is the whole point of the site, so it leads the page rather
          than sitting only in the header. The header's compact search hides
          itself on "/" (see HeaderSearchForm) so this isn't a duplicate.
          Hidden on mobile — phones get the same panel above the browse nav via
          HomeMobileSearch (in the layout), so search leads on small screens. */}
      <section className="hidden lg:block frame-double bg-paper px-4 sm:px-6 py-5">
        <h2 className="font-display text-xl sm:text-2xl text-center text-ink mb-4">
          Search the RKR Database
        </h2>
        <Suspense>
          <HeaderSearchForm variant="hero" />
        </Suspense>
        {status.hasDatabase && (
          <p className="font-body text-xs text-ink-soft text-center mt-3">
            {status.rowCount.toLocaleString()} tracks in the catalogue
            {status.lastUpdated
              ? ` · last updated ${new Date(status.lastUpdated).toLocaleDateString()}`
              : ""}
          </p>
        )}
      </section>

      <Link
        href="/advanced-search"
        className="hidden lg:flex frame-double bg-parchment-deep/40 hover:bg-parchment-deep/70 transition-colors items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 lg:-mt-4"
      >
        <span className="font-display text-base sm:text-xl text-ink">Advanced Search</span>
        <span className="font-body text-sm text-ink-soft hidden sm:inline">
          Search using two or more fields at once
        </span>
        <span className="ml-auto font-display text-xl text-rasta-red" aria-hidden>
          &rsaquo;
        </span>
      </Link>

      {/* "Browse the Catalogue" tile grid — removed by request, kept here in
          case we want it back. The same nine facets are always reachable from
          the sidebar, so nothing is unreachable without it. To restore:
          uncomment this block plus the TILE_ICONS map and the facetConfig
          import at the top of the file.

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
      */}

      <section className="border-t border-paper-stain pt-8">
        <h2 className="font-display text-2xl text-center text-ink mb-5">Using Roots Knotty Roots</h2>
        {/* The full User's Guide, shared with the standalone /guide page via
            GuideContent so the two never drift. */}
        <div className={`${PROSE_CLASS} max-w-2xl mx-auto`}>
          <GuideContent />
        </div>
        <p className="font-body text-sm text-ink-soft text-center mt-8 [&_a]:text-link [&_a]:underline [&_a:hover]:text-rasta-red">
          See also the <Link href="/history">Acknowledgements</Link>.
        </p>
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
