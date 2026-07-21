"use client";

import { usePathname, useSearchParams } from "next/navigation";

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "keyword", label: "Keyword" },
  { value: "artist", label: "Artist" },
  { value: "title", label: "Title" },
  { value: "country", label: "Country" },
  { value: "label", label: "Label" },
  { value: "labelNumber", label: "Label No." },
  { value: "matrixNumber", label: "Matrix No." },
  { value: "producer", label: "Producer" },
  { value: "riddim", label: "Riddim" },
  { value: "origin", label: "Origin" },
];

// Split out of SiteHeader (a server component in the root layout, present
// on every page) specifically to read the current URL's field/q params via
// useSearchParams — a UAT tester caught that after searching Artist="Ellis"
// and landing on a results page, this box silently showed "Keyword" / empty
// instead of the search actually being viewed. Pre-filling from the URL
// means refining a search (e.g. tweaking the term while staying in the
// Artist field) works as a user would expect instead of unknowingly
// re-searching in the wrong field. Client component + Suspense (see
// SiteHeader.tsx) because useSearchParams requires it.
export default function HeaderSearchForm({
  variant = "compact",
}: {
  variant?: "compact" | "hero";
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const currentField = searchParams.get("field") ?? "keyword";
  const currentQ = searchParams.get("q") ?? "";

  // The home page renders its own large "Search the RKR Database" panel, so
  // the header's compact copy would be a second identical search box stacked
  // directly above it. Suppress it there — every other page keeps it.
  if (variant === "compact" && pathname === "/") return null;

  const hero = variant === "hero";

  return (
    <form action="/search" method="GET" className={hero ? "flex" : "mt-5 flex justify-center"}>
      {/* flex-wrap + a min-width on the input keeps the text box usable on a
          narrow phone: the Search button drops onto its own full-width row
          rather than squeezing the input down to a few pixels. */}
      <div
        className={`flex flex-wrap border-2 border-frame bg-paper ${
          hero ? "w-full" : "w-full max-w-lg"
        }`}
      >
        <select
          name="field"
          defaultValue={currentField}
          aria-label="Search field"
          className={`bg-parchment-deep/70 border-r-2 border-frame font-body text-ink focus:outline-none ${
            hero ? "px-2 sm:px-3 py-3 text-sm" : "px-2 py-2 text-xs sm:text-sm"
          }`}
        >
          {FIELD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="q"
          defaultValue={currentQ}
          placeholder={
            hero
              ? "Search by artist, title, label, matrix number, producer…"
              : "Search by title, artist, matrix no.…"
          }
          className={`flex-1 min-w-[10rem] bg-transparent font-body text-ink placeholder:text-ink-soft/70 focus:outline-none ${
            hero ? "px-3 py-3" : "px-3 py-2"
          }`}
        />
        <button
          type="submit"
          className={`grow sm:grow-0 border-t-2 sm:border-t-0 border-frame bg-rasta-green text-paper font-body tracking-wide hover:bg-rasta-red transition-colors ${
            hero ? "px-4 sm:px-6 py-3 text-sm" : "px-4 py-2 text-sm"
          }`}
        >
          Search
        </button>
      </div>
    </form>
  );
}
