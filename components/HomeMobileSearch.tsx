"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import HeaderSearchForm from "./HeaderSearchForm";

// Phones should lead the home page with the search panel, above the browse
// nav (the layout sidebar rendered right after this) — per request. This
// renders ONLY on the home route and ONLY on mobile (lg:hidden); on desktop
// the in-page hero in app/page.tsx is used instead, so the desktop layout is
// unchanged. The two never show at once, so there's no duplicate search box.
export default function HomeMobileSearch() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <div className="lg:hidden px-3 sm:px-4 pt-6">
      <section className="frame-double bg-paper px-4 sm:px-6 py-5">
        <h2 className="font-display text-xl text-center text-ink mb-4">
          Search the RKR Database
        </h2>
        <Suspense>
          <HeaderSearchForm variant="hero" />
        </Suspense>
      </section>
    </div>
  );
}
