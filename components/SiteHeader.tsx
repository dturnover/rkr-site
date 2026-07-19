import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import HeaderSearchForm from "./HeaderSearchForm";

export default function SiteHeader() {
  return (
    // Background matched to the banner artwork's own parchment (#f0d7a7,
    // sampled from its margins) rather than the site's default tint, so the
    // image blends into the header instead of sitting on it as a visibly
    // lighter rectangle — the artwork fades to parchment at its left/right
    // edges with no border there to hide a seam.
    <header className="border-b-2 border-frame" style={{ backgroundColor: "#f0d7a7" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-5">
        {/* Dad's own banner artwork — it already carries the wordmark, the
            "Jamaican Singles Discography 1950–1999" subtitle, and its own
            decorative rasta-stripe border, so it replaces the former
            gradient-text title/subtitle and needs no extra frame of ours. */}
        <Link href="/" className="block">
          <Image
            src="/rkr-header.webp"
            alt="The Original Roots Knotty Roots — Jamaican Singles Discography 1950–1999"
            width={1774}
            height={887}
            priority
            className="w-full h-auto"
          />
        </Link>

        <div className="mt-4">
          <Suspense>
            <HeaderSearchForm />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
