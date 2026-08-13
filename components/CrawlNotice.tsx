import Link from "next/link";

/** Shown above the page when a source is reading unusually fast, and instead
 * of the page once it has been paused.
 *
 * Written to be read by a person, because the person who sees it is most
 * likely someone browsing enthusiastically on a shared connection rather than
 * whoever we're actually aiming at. No accusation, no jargon, and a way to get
 * in touch — being wrong about a real visitor should cost them a polite note,
 * not a locked door with no handle.
 */
export function CrawlWarning() {
  return (
    <div className="border-2 border-rasta-gold bg-paper px-4 py-3 font-body text-sm mb-4">
      <strong className="text-ink">Steady on!</strong>{" "}
      <span className="text-ink-soft">
        Pages are being opened from your connection very quickly. Everything still works &mdash;
        but if it keeps up, access may pause for a few minutes to keep the site fast for
        everyone. If you&rsquo;re doing research and need something more than the site can give
        you, please{" "}
        <Link href="/contact" className="text-link underline hover:text-rasta-red">
          get in touch
        </Link>{" "}
        &mdash; we&rsquo;d rather help than get in your way.
      </span>
    </div>
  );
}

export function CrawlBlocked({ retryAfterMinutes }: { retryAfterMinutes: number }) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* This stands in for a real record, so it must never be mistaken for
          one. Search engines are exempt from the rate limit and shouldn't
          reach this at all — but if one ever did, without this it would index
          "taking a breather" as that record's content and quietly replace a
          real catalogue page in the results. React hoists the tag into the
          document head. */}
      <meta name="robots" content="noindex, nofollow, noarchive" />
      <div className="frame-double bg-paper p-6 sm:p-8">
        <h1 className="font-display text-2xl text-ink mb-3">Taking a short breather</h1>
        <p className="font-body text-ink mb-4">
          A very large number of pages have been requested from your connection in a short time,
          so the catalogue is paused here for about{" "}
          <strong>
            {retryAfterMinutes} minute{retryAfterMinutes === 1 ? "" : "s"}
          </strong>
          . Nothing is wrong with your account or your device, and this clears by itself &mdash;
          no need to do anything.
        </p>
        <p className="font-body text-sm text-ink-soft mb-4">
          Roots Knotty Roots is free and always will be. This limit exists only to stop the whole
          discography being copied wholesale &mdash; it&rsquo;s thirty-five years of one man&rsquo;s
          research, given away on the understanding that it stays here for everyone.
        </p>
        <p className="font-body text-sm text-ink">
          If you&rsquo;re a researcher, collector or archivist who needs more than ordinary
          browsing allows, please{" "}
          <Link href="/contact" className="text-link underline hover:text-rasta-red">
            tell us what you&rsquo;re working on
          </Link>
          . Genuine requests are welcome and usually granted.
        </p>
      </div>
    </div>
  );
}
