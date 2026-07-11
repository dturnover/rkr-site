import Link from "next/link";
import { Suspense } from "react";
import HeaderSearchForm from "./HeaderSearchForm";

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

          <Suspense>
            <HeaderSearchForm />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
