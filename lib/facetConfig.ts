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
