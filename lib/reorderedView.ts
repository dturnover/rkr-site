import type { Metadata } from "next";
import type { RawSearchParams } from "@/lib/searchParamsUtil";

// A sorted or paginated view is the same rows in another order — duplicate
// content, and expensive to produce: sorting a large facet is a full table
// sort reading tens of thousands of rows. Crawlers fetch each such URL once,
// so the query cache never helps them, and every sortable column header
// multiplies the number of URLs on offer.
//
// These are refused in robots.txt and the links carry rel="nofollow", but a
// URL already in an index, or reached from somewhere else, still needs telling
// not to stay there. noindex removes it; the canonical points whatever ranking
// it accumulated back at the clean page.

export function reorderedViewMetadata(
  sp: RawSearchParams,
  canonicalPath: string
): Metadata {
  const reordered = ["sort", "dir", "page"].some((k) => {
    const v = sp[k];
    const value = Array.isArray(v) ? v[0] : v;
    // page=1 is the canonical page, not a reordering of it.
    return !!value && !(k === "page" && value === "1");
  });

  if (!reordered) return { alternates: { canonical: canonicalPath } };

  return {
    robots: { index: false, follow: true },
    alternates: { canonical: canonicalPath },
  };
}
