import Link from "next/link";
import type { FacetDef } from "@/lib/facetConfig";
import type { FacetIndexEntry } from "@/lib/queries/browse";

function groupAlpha(entries: FacetIndexEntry[]) {
  const groups = new Map<string, FacetIndexEntry[]>();
  for (const entry of entries) {
    const letter = /^[a-z]/i.test(entry.label) ? entry.label[0].toUpperCase() : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(entry);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
}

export default function FacetBrowseIndex({
  facet,
  entries,
}: {
  facet: FacetDef;
  entries: FacetIndexEntry[];
}) {
  if (entries.length === 0) {
    return <p className="font-body italic text-ink-soft py-8">No data yet — run the CSV import first.</p>;
  }

  if (facet.sortMode === "numeric") {
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

  const grouped = groupAlpha(entries);
  const letters = grouped.map(([letter]) => letter);

  return (
    <div>
      <nav className="flex flex-wrap gap-1 mb-6 font-body text-sm">
        {letters.map((letter) => (
          <a
            key={letter}
            href={`#letter-${letter}`}
            className="w-7 h-7 flex items-center justify-center border border-paper-stain hover:bg-parchment-deep text-ink"
          >
            {letter}
          </a>
        ))}
      </nav>

      <div className="space-y-8">
        {grouped.map(([letter, items]) => (
          <section key={letter} id={`letter-${letter}`}>
            <h2 className="font-display text-2xl text-rasta-red border-b border-paper-stain mb-3 pb-1">
              {letter}
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
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
