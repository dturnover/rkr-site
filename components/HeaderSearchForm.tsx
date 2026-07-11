"use client";

import { useSearchParams } from "next/navigation";

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
export default function HeaderSearchForm() {
  const searchParams = useSearchParams();
  const currentField = searchParams.get("field") ?? "keyword";
  const currentQ = searchParams.get("q") ?? "";

  return (
    <form action="/search" method="GET" className="mt-5 flex justify-center">
      <div className="flex w-full max-w-lg border-2 border-frame bg-paper">
        <select
          name="field"
          defaultValue={currentField}
          aria-label="Search field"
          className="bg-parchment-deep/70 border-r-2 border-frame px-2 py-2 font-body text-xs sm:text-sm text-ink focus:outline-none"
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
  );
}
