export type FacetSlug =
  | "artists"
  | "countries"
  | "years"
  | "formats"
  | "labels"
  | "producers"
  | "riddims"
  | "genres"
  | "origins";

export interface FacetDef {
  slug: FacetSlug;
  label: string;
  singular: string;
  /** Column used for grouping/filtering (already normalized where relevant). */
  column: "artist_norm" | "country_norm" | "year" | "format_norm" | "label_norm" | "producer_norm" | "riddim_norm" | "genre_norm" | "origin_norm";
  /** Column used to display a representative, human-cased value. */
  displayColumn: "artist" | "country" | "year" | "format" | "label" | "producer" | "riddim" | "genre" | "song_origin";
  sortMode: "alpha" | "numeric";
  /** Alpha facets that are naturally small, bounded categories (country,
   * format, genre — a fixed real-world taxonomy) rather than per-work free
   * text (artist, label, producer, riddim, origin — grows with the
   * catalogue). Small ones list every value on one page; the rest are
   * letter-paginated (see getFacetIndex in lib/queries/browse.ts) since
   * listing thousands of values in one page was measured to be slow to
   * query and heavy to render. */
  singlePage?: boolean;
}

export const FACETS: Record<FacetSlug, FacetDef> = {
  artists: {
    slug: "artists",
    label: "Artists",
    singular: "Artist",
    column: "artist_norm",
    displayColumn: "artist",
    sortMode: "alpha",
  },
  countries: {
    slug: "countries",
    label: "Countries",
    singular: "Country",
    column: "country_norm",
    displayColumn: "country",
    sortMode: "alpha",
    singlePage: true,
  },
  years: {
    slug: "years",
    label: "Years",
    singular: "Year",
    column: "year",
    displayColumn: "year",
    sortMode: "numeric",
  },
  formats: {
    slug: "formats",
    label: "Formats",
    singular: "Format",
    column: "format_norm",
    displayColumn: "format",
    sortMode: "alpha",
    singlePage: true,
  },
  labels: {
    slug: "labels",
    label: "Labels",
    singular: "Label",
    column: "label_norm",
    displayColumn: "label",
    sortMode: "alpha",
  },
  producers: {
    slug: "producers",
    label: "Producers",
    singular: "Producer",
    column: "producer_norm",
    displayColumn: "producer",
    sortMode: "alpha",
  },
  riddims: {
    slug: "riddims",
    label: "Riddims",
    singular: "Riddim",
    column: "riddim_norm",
    displayColumn: "riddim",
    sortMode: "alpha",
  },
  genres: {
    slug: "genres",
    label: "Genres",
    singular: "Genre",
    column: "genre_norm",
    displayColumn: "genre",
    sortMode: "alpha",
    singlePage: true,
  },
  origins: {
    slug: "origins",
    label: "Origins",
    singular: "Song Origin",
    column: "origin_norm",
    displayColumn: "song_origin",
    sortMode: "alpha",
  },
};

export const FACET_ORDER: FacetSlug[] = [
  "artists",
  "countries",
  "years",
  "formats",
  "labels",
  "producers",
  "riddims",
  "genres",
  "origins",
];

export function isFacetSlug(value: string): value is FacetSlug {
  return Object.prototype.hasOwnProperty.call(FACETS, value);
}

/** Builds a /browse/[facet]/[value] URL from a raw (display-cased) field
 * value pulled off a record — e.g. the "Riddim" cell in a results table.
 * getFacetValueRows() matches the URL segment directly against the norm
 * column (lower/trim), except for `years`, which has no _norm variant and
 * matches the raw year string as-is — so normalization must mirror exactly
 * what each facet's `column` actually is. Returns null for blank values,
 * since there's nothing to link to. */
export function facetLink(slug: FacetSlug, rawValue: string | null | undefined): string | null {
  if (!rawValue || !rawValue.trim()) return null;
  const facet = FACETS[slug];
  const value = facet.sortMode === "numeric" ? rawValue.trim() : rawValue.trim().toLowerCase();
  return `/browse/${slug}/${encodeURIComponent(value)}`;
}
