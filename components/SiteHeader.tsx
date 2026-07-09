import Link from "next/link";

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
            <div className="flex w-full max-w-lg border-2 border-frame bg-paper">
              <select
                name="field"
                defaultValue="keyword"
                aria-label="Search field"
                className="bg-parchment-deep/70 border-r-2 border-frame px-2 py-2 font-body text-xs sm:text-sm text-ink focus:outline-none"
              >
                <option value="keyword">Keyword</option>
                <option value="artist">Artist</option>
                <option value="title">Title</option>
                <option value="country">Country</option>
                <option value="label">Label</option>
                <option value="labelNumber">Label No.</option>
                <option value="matrixNumber">Matrix No.</option>
                <option value="producer">Producer</option>
                <option value="riddim">Riddim</option>
                <option value="origin">Origin</option>
              </select>
              <input
                type="text"
                name="q"
                placeholder="Search by title, artist, matrix no.&hellip;"
                className="flex-1 min-w-0 bg-transparent px-3 py-2 font-body text-ink placeholder:text-ink-soft/70 focus:outline-none"
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
      </div>
    </header>
  );
}
