import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { canReconstructBefore, reconstructBeforeImport } from "@/lib/import/importHistory";
import { writeRowsToXlsx } from "@/lib/import/exportFormat";

// Reconstructs and downloads the catalogue as it stood BEFORE a given import
// (from the rolling diff history), as an .xlsx. Read-only — it never changes the
// live catalogue; to actually roll back, the admin re-uploads this file and the
// normal diff import makes the live data match it.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idParam = request.nextUrl.searchParams.get("before");
  const id = idParam ? parseInt(idParam, 10) : NaN;
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Missing or invalid 'before' import id" }, { status: 400 });
  }

  if (!(await canReconstructBefore(id))) {
    return NextResponse.json(
      { error: "This point can't be reconstructed (an import in the range was too large to store)." },
      { status: 409 }
    );
  }

  try {
    const buffer = await writeRowsToXlsx(reconstructBeforeImport(id));
    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rkr-before-import-${id}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: `Export failed: ${message}` }, { status: 500 });
  }
}
