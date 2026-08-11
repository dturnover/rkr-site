/** Placeholder shown while a page's data loads.
 *
 * Browse and search pages are rendered per request (they read the letter, the
 * query, the sort), so a click can't be answered instantly no matter how fast
 * the query is — there's always a round trip. Without a loading boundary the
 * browser just sits on the old page during it, which reads as the site being
 * slow. This gives the click an immediate response and doubles as the target
 * Next.js prefetches for a dynamic route.
 *
 * Deliberately plain: no animation to distract, just the shape of what's
 * coming, in the same parchment tones as the real content.
 */
export default function PageSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-8 w-64 max-w-full bg-parchment-deep/70 mb-6" />
      <div className="flex flex-wrap gap-1 mb-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="w-7 h-7 bg-parchment-deep/50" />
        ))}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="h-4 bg-parchment-deep/40"
            // Ragged widths so it reads as a list of names rather than a block.
            style={{ width: `${55 + ((i * 37) % 40)}%` }}
          />
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading…
      </span>
    </div>
  );
}
