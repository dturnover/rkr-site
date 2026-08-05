import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { getClient } from "@/lib/db/client";
import { CSV_FIELDS, type FieldRow } from "@/lib/import/importCsv";
import { writeRowsToXlsx } from "@/lib/import/exportFormat";

// A full-catalogue export can be large (130k+ rows); give it headroom like the
// import routes. Reads cookies for auth, so it's dynamic regardless.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Read the table in id-keyset pages (index-efficient, unlike growing OFFSETs)
// and feed each row straight into the streaming workbook writer, so we never
// hold all rows or all cells in memory at once.
const PAGE = 5000;

async function* liveRows(): AsyncGenerator<FieldRow> {
  const client = await getClient();
  const cols = CSV_FIELDS.join(", ");
  let lastId = 0;
  for (;;) {
    const res = await client.execute({
      sql: `SELECT id, ${cols} FROM records WHERE id > ? ORDER BY id LIMIT ?`,
      args: [lastId, PAGE],
    });
    if (res.rows.length === 0) break;
    for (const raw of res.rows) {
      const r = raw as unknown as Record<string, string | null> & { id: number };
      const row: FieldRow = {};
      for (const f of CSV_FIELDS) row[f] = r[f] ?? null;
      yield row;
      lastId = Number(r.id);
    }
    if (res.rows.length < PAGE) break;
  }
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const buffer = await writeRowsToXlsx(liveRows());
    const date = new Date().toISOString().slice(0, 10);
    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rkr-export-${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Most likely "no such table: records" — i.e. no catalogue imported yet.
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: `Export failed: ${message}` }, { status: 500 });
  }
}
