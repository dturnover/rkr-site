import Link from "next/link";
import type { FacetDef } from "@/lib/facetConfig";
import type { FacetIndexEntry } from "@/lib/queries/browse";

// "#" first to match its position in the sort order (digits/punctuation
// collate before letters), then a-z.
const LETTERS = ["#", ..."abcdefghijklmnopqrstuvwxyz"];

function groupAlpha(entries: FacetIndexEntry[]) {
  const groups = new Map<string, FacetIndexEntry[]>();
  for (const entry of entries) {
    const letter = /^[a-z]/i.test(entry.label) ? entry.label[0].toUpperCase() : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(entry);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b)));
}

export default function FacetBrowseIndex({
  facet,
  entries,
  letter,
}: {
  facet: FacetDef;
  entries: FacetIndexEntry[];
  letter?: string;
}) {
  if (facet.sortMode === "numeric") {
    if (entries.length === 0) {
      return (
        <p className="font-body italic text-ink-soft py-8">
          No data yet &mdash; run the CSV import first.
        </p>
      );
    }
    return (
      <ul className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <li key={e.value}>
            <Link
              href={`/browse/${facet.slug}/${encodeURIComponent(e.value)}`}
              className="inline-flex items-center gap-2 border border-paper-stain bg-paper px-3 py-1.5 font-catalog text-sm hover:bg-parchment-deep"
            >
              {e.label}
              <span className="text-ink-soft text-xs">({e.count.toLocaleString()})</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  // Small, bounded categories (country, format, genre — see `singlePage` on
  // FacetDef) list everything at once, grouped by letter with in-page jump
  // anchors — there just aren't enough values for real pagination to help.
  if (!letter) {
    if (entries.length === 0) {
      return (
        <p className="font-body italic text-ink-soft py-8">
          No data yet &mdash; run the CSV import first.
        </p>
      );
    }
    const grouped = groupAlpha(entries);
    return (
      <div>
        <nav className="flex flex-wrap gap-1 mb-6 font-body text-sm">
          {grouped.map(([l]) => (
            <a
              key={l}
              href={`#letter-${l}`}
              className="w-7 h-7 flex items-center justify-center border border-paper-stain hover:bg-parchment-deep text-ink"
            >
              {l}
            </a>
          ))}
        </nav>
        <div className="space-y-8">
          {grouped.map(([l, items]) => (
            <section key={l} id={`letter-${l}`}>
              <h2 className="font-display text-2xl text-rasta-red border-b border-paper-stain mb-3 pb-1">
                {l}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-1">
                {items.map((e) => (
                  <li key={e.value} className="truncate">
                    <Link
                      href={`/browse/${facet.slug}/${encodeURIComponent(e.value)}`}
                      className="font-body hover:text-rasta-red"
                    >
                      {e.label}
                    </Link>{" "}
                    <span className="text-ink-soft text-xs">({e.count.toLocaleString()})</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    );
  }

  // Large, per-work free-text facets (artist, label, producer, riddim,
  // origin) show one letter per page — each letter link is a real
  // navigation (?letter=x), not an in-page anchor, so only the selected
  // letter's values are ever queried and rendered (see getFacetIndex).
  const active = letter;

  return (
    <div>
      <nav className="flex flex-wrap gap-1 mb-6 font-body text-sm" aria-label="Filter by first letter">
        {LETTERS.map((l) => (
          <Link
            key={l}
            href={`/browse/${facet.slug}?letter=${encodeURIComponent(l)}`}
            className={`w-7 h-7 flex items-center justify-center border ${
              l === active
                ? "bg-frame text-paper border-frame"
                : "border-paper-stain hover:bg-parchment-deep text-ink"
            }`}
          >
            {l.toUpperCase()}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <p className="font-body italic text-ink-soft py-8">
          No {facet.label.toLowerCase()} under &ldquo;{active.toUpperCase()}&rdquo;.
        </p>
      ) : (
        <section>
          <h2 className="font-display text-2xl text-rasta-red border-b border-paper-stain mb-3 pb-1">
            {active.toUpperCase()}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-1">
            {entries.map((e) => (
              <li key={e.value} className="truncate">
                <Link
                  href={`/browse/${facet.slug}/${encodeURIComponent(e.value)}`}
                  className="font-body hover:text-rasta-red"
                >
                  {e.label}
                </Link>{" "}
                <span className="text-ink-soft text-xs">({e.count.toLocaleString()})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
