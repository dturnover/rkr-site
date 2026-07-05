import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Mirrors the DDL in lib/db/ddl.ts. This definition exists purely so the
// query layer (lib/queries/*) gets typed `select`/`where`/`orderBy` support —
// table creation itself is always done via the raw SQL in ddl.ts, since a
// fresh database file is rebuilt wholesale on every CSV import.
export const records = sqliteTable("records", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  artist: text("artist"),
  artistCredit: text("artist_credit"),
  title: text("title"),
  titleCredit: text("title_credit"),
  matrixNumber: text("matrix_number"),
  labelNumber: text("label_number"),
  label: text("label"),
  country: text("country"),
  format: text("format"),
  producer: text("producer"),
  year: text("year"),
  yearSort: integer("year_sort"),
  riddim: text("riddim"),
  version: text("version"),
  bSideArtist: text("b_side_artist"),
  bSideArtistCredit: text("b_side_artist_credit"),
  bSideTitle: text("b_side_title"),
  bSideTitleCredit: text("b_side_title_credit"),
  bSideMatrixNumber: text("b_side_matrix_number"),
  bSideLabelNumber: text("b_side_label_number"),
  songOrigin: text("song_origin"),
  notes: text("notes"),
  genre: text("genre"),
  additions: text("additions"),

  artistNorm: text("artist_norm"),
  labelNorm: text("label_norm"),
  producerNorm: text("producer_norm"),
  riddimNorm: text("riddim_norm"),
  countryNorm: text("country_norm"),
  originNorm: text("origin_norm"),
  genreNorm: text("genre_norm"),
  formatNorm: text("format_norm"),
});

export type RecordRow = typeof records.$inferSelect;
