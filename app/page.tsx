import Link from "next/link";
import { Suspense } from "react";
import { FACET_ORDER, FACETS } from "@/lib/facetConfig";
import { getDatabaseStatus } from "@/lib/import/atomicSwap";
import HeaderSearchForm from "@/components/HeaderSearchForm";

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
      {/* Search is the whole point of the site, so it leads the page rather
          than sitting only in the header. The header's compact search hides
          itself on "/" (see HeaderSearchForm) so this isn't a duplicate. */}
      <section className="frame-double bg-paper px-4 sm:px-6 py-5">
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
        className="frame-double bg-parchment-deep/40 hover:bg-parchment-deep/70 transition-colors flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 -mt-4"
      >
        <span className="font-display text-base sm:text-xl text-ink">Advanced Search</span>
        <span className="font-body text-sm text-ink-soft hidden sm:inline">
          Search using two or more fields at once
        </span>
        <span className="ml-auto font-display text-xl text-rasta-red" aria-hidden>
          &rsaquo;
        </span>
      </Link>

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

      <section className="border-t border-paper-stain pt-8">
        <h2 className="font-display text-2xl text-center text-ink mb-5">
          Introduction &amp; User&rsquo;s Guide
        </h2>
        <div className="font-body text-ink leading-relaxed space-y-4 max-w-2xl mx-auto [&_a]:text-link [&_a]:underline [&_a:hover]:text-rasta-red">
          <p>
            Compiled over decades by Michael Turner &amp; Robert Schoenfeld,{" "}
            <em>Roots Knotty Roots</em> is the most comprehensive discography of Jamaican
            music ever assembled &mdash; every 7&Prime;, 10&Prime;, and 12&Prime; single,
            from calypso and mento through ska, rocksteady, reggae and dancehall. It
            documents singles released from 1952 through 1999, approaching 99% of the
            records from the golden era of Jamaican recordings. This site puts the entire
            catalogue online, free, for good.
          </p>

          <h3 className="font-display text-lg text-rasta-red pt-2">Searching</h3>
          <p>
            The box above searches every field at once. Use the dropdown beside it to
            restrict a search to a single field &mdash; picking <strong>Artist</strong> and
            typing <em>Ellis</em> finds artists named Ellis, rather than every record with
            &ldquo;Ellis&rdquo; anywhere in its entry. Matrix and label numbers are
            searchable too, punctuation and all.
          </p>
          <p>
            Use <Link href="/advanced-search">Advanced Search</Link> to combine fields
            &mdash; for example country, year and genre together &mdash; where each field
            you fill in narrows the results further. Any field you leave blank is ignored.
          </p>
          <p>
            Every column heading in a results table sorts by that column; click it a second
            time to reverse the order. Artist, label, producer, riddim and country values
            are links &mdash; click one to see every other record sharing it.
          </p>

          <h3 className="font-display text-lg text-rasta-red pt-2">Reading a listing</h3>
          <p>
            Each entry gives as much as is known about one record: artist and the literal
            label credit, title and its variants, matrix and label numbers, format, country,
            producer, year, riddim, origin, genre, notes, and full B-side details. Entries
            the compilers could not confirm are shown in italics and marked{" "}
            <em>uncertain</em> rather than presented as fact.
          </p>
          <p>
            <Link href="/guide">Read the full User&rsquo;s Guide</Link> for what each field
            means and how the information was gathered, or the{" "}
            <Link href="/history">History of RKR</Link> for the story behind the project.
          </p>
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
