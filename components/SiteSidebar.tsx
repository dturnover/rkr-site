"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FACET_ORDER, FACETS } from "@/lib/facetConfig";

const ABOUT_LINKS: { href: string; label: string }[] = [
  { href: "/guide", label: "User's Guide" },
  { href: "/history", label: "History of RKR" },
  { href: "/interviews", label: "Interviews & Features" },
];

export default function SiteSidebar({
  isEditor = false,
  isAdmin = false,
}: {
  isEditor?: boolean;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();

  // Editor tools only appear for a signed-in editor/admin. New Track and the
  // Modification Log are for everyone with edit access; Admin is admin-only.
  const editorLinks: { href: string; label: string }[] = isEditor
    ? [
        { href: "/records/new", label: "New Track" },
        { href: "/mod-log", label: "Modification Log" },
        { href: "/admin", label: isAdmin ? "Admin" : "Account" },
      ]
    : [];

  return (
    <nav
      aria-label="Browse categories"
      className="shrink-0 border-b-2 lg:border-b-0 lg:border-r-2 border-frame bg-parchment-deep/40 lg:bg-transparent lg:w-44 lg:sticky lg:top-6 lg:self-start"
    >
      <ul className="flex flex-wrap lg:flex-col gap-x-5 gap-y-2 lg:gap-y-1 font-body text-sm px-4 sm:px-6 lg:px-0 lg:pr-4 py-3 lg:py-0">
        {FACET_ORDER.map((slug) => {
          // "Advanced Search" was permanently bold regardless of the current
          // page (a static design choice, not an active-state indicator),
          // which a UAT tester read as the sidebar pointing at the wrong
          // section while actually browsing a facet — there wasn't any
          // active-state signal at all. This adds a real one.
          const active = pathname === `/browse/${slug}` || pathname.startsWith(`/browse/${slug}/`);
          return (
            <li key={slug}>
              <Link
                href={`/browse/${slug}`}
                aria-current={active ? "page" : undefined}
                className={`block underline decoration-paper-stain decoration-2 underline-offset-4 lg:no-underline lg:hover:underline lg:py-1 hover:text-rasta-red ${
                  active ? "text-rasta-red font-semibold" : "text-ink"
                }`}
              >
                {FACETS[slug].label}
              </Link>
            </li>
          );
        })}
        <li className="lg:mt-2 lg:pt-2 lg:border-t lg:border-paper-stain">
          <Link
            href="/advanced-search"
            aria-current={pathname === "/advanced-search" ? "page" : undefined}
            className={`block underline decoration-paper-stain decoration-2 underline-offset-4 lg:no-underline lg:hover:underline lg:py-1 font-semibold hover:text-rasta-red ${
              pathname === "/advanced-search" ? "text-rasta-red" : "text-ink"
            }`}
          >
            Advanced Search
          </Link>
        </li>

        {ABOUT_LINKS.map((link, i) => (
          <li
            key={link.href}
            className={i === 0 ? "lg:mt-2 lg:pt-2 lg:border-t lg:border-paper-stain" : undefined}
          >
            <Link
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`block underline decoration-paper-stain decoration-2 underline-offset-4 lg:no-underline lg:hover:underline lg:py-1 hover:text-rasta-red ${
                pathname === link.href ? "text-rasta-red font-semibold" : "text-ink"
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}

        {editorLinks.map((link, i) => (
          <li
            key={link.href}
            className={i === 0 ? "lg:mt-2 lg:pt-2 lg:border-t lg:border-paper-stain" : undefined}
          >
            <Link
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`block underline decoration-rasta-green decoration-2 underline-offset-4 lg:no-underline lg:hover:underline lg:py-1 hover:text-rasta-red ${
                pathname === link.href ? "text-rasta-red font-semibold" : "text-rasta-green"
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
