"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import HeaderSearchForm from "./HeaderSearchForm";

// Phones should lead the home page with the search panels, above the browse
// nav (the layout sidebar rendered right after this) — per request. This
// renders ONLY on the home route and ONLY on mobile (lg:hidden); on desktop
// the in-page hero/Advanced Search in app/page.tsx are used instead, so the
// desktop layout is unchanged. The two never show at once, so nothing dupes.
export default function HomeMobileSearch() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <div className="lg:hidden px-3 sm:px-4 pt-6 space-y-4">
      <section className="frame-double bg-paper px-4 sm:px-6 py-5">
        <h2 className="font-display text-xl text-center text-ink mb-4">
          Search the RKR Database
        </h2>
        <Suspense>
          <HeaderSearchForm variant="hero" />
        </Suspense>
      </section>

      <Link
        href="/advanced-search"
        className="frame-double bg-parchment-deep/40 hover:bg-parchment-deep/70 transition-colors flex items-center gap-3 px-4 sm:px-6 py-4"
      >
        <span className="font-display text-base text-ink">Advanced Search</span>
        <span className="ml-auto font-display text-xl text-rasta-red" aria-hidden>
          &rsaquo;
        </span>
      </Link>
    </div>
  );
}
