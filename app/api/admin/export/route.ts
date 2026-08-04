import { NextResponse } from "next/server";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { getClient } from "@/lib/db/client";
import { CSV_FIELDS } from "@/lib/import/importCsv";

// A full-catalogue export can be large (130k+ rows); give it headroom like the
// import routes. Reads cookies for auth, so it's dynamic regardless.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Human-readable headers, in the SAME order as CSV_FIELDS. The importer skips
// the header row and reads columns positionally, so this order is what makes
// the file re-importable; the labels themselves are just for reading in Excel.
const HEADER_LABELS: Record<(typeof CSV_FIELDS)[number], string> = {
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

// Read the table in id-keyset pages (index-efficient, unlike growing OFFSETs)
// and feed each row straight into the streaming workbook writer, so we never
// hold all rows or all cells in memory at once.
const PAGE = 5000;

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await getClient();
  const cols = CSV_FIELDS.join(", ");

  const passthrough = new PassThrough();
  const chunks: Buffer[] = [];
  passthrough.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    passthrough.on("end", resolve);
    passthrough.on("error", reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passthrough });
  const sheet = workbook.addWorksheet("RKR");

  try {
    sheet.addRow(CSV_FIELDS.map((f) => HEADER_LABELS[f])).commit();

    let lastId = 0;
    for (;;) {
      const res = await client.execute({
        sql: `SELECT id, ${cols} FROM records WHERE id > ? ORDER BY id LIMIT ?`,
        args: [lastId, PAGE],
      });
      if (res.rows.length === 0) break;
      for (const row of res.rows) {
        const r = row as unknown as Record<string, string | number | null>;
        sheet.addRow(CSV_FIELDS.map((f) => (r[f] ?? null))).commit();
        lastId = Number(r.id);
      }
      if (res.rows.length < PAGE) break;
    }

    sheet.commit();
    await workbook.commit();
  } catch (err) {
    passthrough.destroy();
    // Most likely "no such table: records" — i.e. no catalogue imported yet.
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: `Export failed: ${message}` }, { status: 500 });
  }

  await finished;
  const buffer = Buffer.concat(chunks);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rkr-export-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
