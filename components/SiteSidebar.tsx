import Link from "next/link";
import { FACET_ORDER, FACETS } from "@/lib/facetConfig";

export default function SiteSidebar() {
  return (
    <nav
      aria-label="Browse categories"
      className="shrink-0 border-b-2 lg:border-b-0 lg:border-r-2 border-frame bg-parchment-deep/40 lg:bg-transparent lg:w-44 lg:sticky lg:top-6 lg:self-start"
    >
      <ul className="flex flex-wrap lg:flex-col gap-x-5 gap-y-2 lg:gap-y-1 font-body text-sm px-4 sm:px-6 lg:px-0 lg:pr-4 py-3 lg:py-0">
        {FACET_ORDER.map((slug) => (
          <li key={slug}>
            <Link
              href={`/browse/${slug}`}
              className="block text-ink hover:text-rasta-red underline decoration-paper-stain decoration-2 underline-offset-4 lg:no-underline lg:hover:underline lg:py-1"
            >
              {FACETS[slug].label}
            </Link>
          </li>
        ))}
        <li className="lg:mt-2 lg:pt-2 lg:border-t lg:border-paper-stain">
          <Link
            href="/advanced-search"
            className="block text-ink hover:text-rasta-red underline decoration-paper-stain decoration-2 underline-offset-4 lg:no-underline lg:hover:underline lg:py-1 font-semibold"
          >
            Advanced Search
          </Link>
        </li>
      </ul>
    </nav>
  );
}
