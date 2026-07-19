import Link from "next/link";
import { Suspense } from "react";
import HeaderBanner from "./HeaderBanner";
import HeaderSearchForm from "./HeaderSearchForm";

export default function SiteHeader() {
  return (
    <header className="border-b-2 border-frame bg-parchment-deep/60">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-5">
        <Link href="/" className="block" aria-label="Roots Knotty Roots — home">
          <HeaderBanner />
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
