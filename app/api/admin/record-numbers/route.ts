import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { assignMissingRecordNumbersDetailed } from "@/lib/recordNumbers";
import { revalidateRecords } from "@/lib/cacheTags";

// Hands catalogue numbers to any records that don't have one yet.
//
// Every completed import already does this, so in steady state there is
// nothing here to press. It exists for the two cases where waiting for the
// next upload isn't good enough: the first deploy after this feature ships
// (the catalogue is already loaded, so no import is due, and without this the
// numbers wouldn't appear until the compiler next uploads), and cleaning up
// after an import whose best-effort numbering step failed.
//
// Safe to press repeatedly — the assignment is idempotent and
// never renumbers a record that already has a number.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  try {
    const { count, ids } = await assignMissingRecordNumbersDetailed();
    // Refresh only the records that just got a number, plus their numbers'
    // lookups (revalidateRecords does both). This used to flush the whole
    // catalogue, so every press rebuilt all 135k cached record pages as
    // crawlers came by — to show a number on a handful of them. Nothing
    // assigned: nothing to refresh. Too many to list (the very first run):
    // the whole set.
    if (count > 0) await revalidateRecords(ids);
    return NextResponse.redirect(new URL(`/admin?numbered=${count}`, request.url));
  } catch (err) {
    console.error("[record-numbers] assignment failed", err);
    return NextResponse.redirect(new URL("/admin?numberedError=1", request.url));
  }
}
