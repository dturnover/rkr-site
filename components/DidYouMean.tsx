import Link from "next/link";
import type { NameSuggestion } from "@/lib/queries/nameSuggestions";

/** "Did you mean …?" under a search that found nothing. Each suggestion links
 * to that name's browse page — every record under it — rather than re-running
 * the search, so the link always lands on a complete list. */
export default function DidYouMean({ suggestions }: { suggestions: NameSuggestion[] }) {
  if (suggestions.length === 0) return null;
  return (
    <div className="frame-double bg-paper px-4 py-3 mb-6 font-body">
      <p className="text-ink mb-2">Did you mean:</p>
      <ul className="space-y-1">
        {suggestions.map((s) => (
          <li key={`${s.kind}:${s.name}`}>
            <Link href={s.href} className="text-link underline hover:text-rasta-red font-semibold">
              {s.name}
            </Link>
            <span className="text-ink-soft text-sm">
              {" "}
              &middot; {s.kind} &middot; {s.count.toLocaleString()} track{s.count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
