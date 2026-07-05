import Link from "next/link";
import { FACET_ORDER, FACETS } from "@/lib/facetConfig";

export default function SiteHeader() {
  return (
    <header className="border-b-2 border-frame bg-parchment-deep/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-5">
        <div className="frame-double bg-parchment px-6 py-6 sm:px-10 sm:py-8 text-center">
          <Link href="/" className="inline-block">
            <h1 className="font-display text-4xl sm:text-6xl tracking-wide text-title-gradient drop-shadow-sm">
              Roots Knotty Roots
            </h1>
          </Link>
          <p className="font-body italic text-ink-soft mt-2 text-sm sm:text-base">
            The Discography of Jamaican Music &mdash; Ska &middot; Rocksteady &middot; Reggae &middot; Dancehall
          </p>

          <form action="/search" method="GET" className="mt-5 flex justify-center">
            <div className="flex w-full max-w-md border-2 border-frame bg-paper">
              <input
                type="text"
                name="q"
                placeholder="Search by title or artist&hellip;"
                className="flex-1 bg-transparent px-3 py-2 font-body text-ink placeholder:text-ink-soft/70 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-frame text-paper font-body text-sm tracking-wide hover:bg-rasta-red transition-colors"
              >
                Search
              </button>
            </div>
          </form>
        </div>

        <nav className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 font-body text-sm sm:text-base">
          {FACET_ORDER.map((slug) => (
            <Link
              key={slug}
              href={`/browse/${slug}`}
              className="text-ink hover:text-rasta-red underline decoration-paper-stain decoration-2 underline-offset-4"
            >
              {FACETS[slug].label}
            </Link>
          ))}
          <Link
            href="/advanced-search"
            className="text-ink hover:text-rasta-red underline decoration-paper-stain decoration-2 underline-offset-4"
          >
            Advanced Search
          </Link>
        </nav>
      </div>
    </header>
  );
}
