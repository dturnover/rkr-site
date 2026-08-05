import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { CSV_FIELDS, type FieldRow } from "./importCsv";

// Human-readable headers, in the SAME order as CSV_FIELDS. The importer skips
// the header row and reads columns positionally, so this order is what makes an
// exported file re-importable; the labels themselves are just for reading in
// Excel. Shared by the live-catalogue export and the historical-state export so
// the two can never diverge.
export const HEADER_LABELS: Record<(typeof CSV_FIELDS)[number], string> = {
  artist: "Artist",
  artist_credit: "Artist Credit",
  title: "Title",
  title_credit: "Title Credit",
  matrix_number: "Matrix No.",
  label_number: "Label No.",
  label: "Label",
  country: "Country",
  format: "Format",
  pressing: "Issue Notes",
  producer: "Producer",
  year: "Year",
  riddim: "Riddim",
  version: "Version",
  b_side_artist: "B-Side Artist",
  b_side_artist_credit: "B-Side Artist Credit",
  b_side_title: "B-Side Title",
  b_side_title_credit: "B-Side Title Credit",
  b_side_matrix_number: "B-Side Matrix No.",
  b_side_label_number: "B-Side Label No.",
  song_origin: "Song Origin",
  notes: "Notes",
  genre: "Genre",
  additions: "Additions",
};

/** Streams an async sequence of catalogue rows into an .xlsx workbook and
 * returns the finished bytes, never holding all rows or cells in memory at
 * once. Column order matches CSV_FIELDS, so the result is re-importable. */
export async function writeRowsToXlsx(rows: AsyncIterable<FieldRow>): Promise<ArrayBuffer> {
  const passthrough = new PassThrough();
  const chunks: Buffer[] = [];
  passthrough.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    passthrough.on("end", resolve);
    passthrough.on("error", reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passthrough });
  const sheet = workbook.addWorksheet("RKR");
  sheet.addRow(CSV_FIELDS.map((f) => HEADER_LABELS[f])).commit();

  for await (const row of rows) {
    sheet.addRow(CSV_FIELDS.map((f) => row[f] ?? null)).commit();
  }

  sheet.commit();
  await workbook.commit();
  await finished;
  // Copy into a plain ArrayBuffer — an unambiguous Response body across the
  // Node/DOM typings (a Node Buffer / Uint8Array<ArrayBufferLike> is not).
  const joined = Buffer.concat(chunks);
  const ab = new ArrayBuffer(joined.byteLength);
  new Uint8Array(ab).set(joined);
  return ab;
}
