import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/requireAdmin";
import { assignMissingRecordNumbers } from "@/lib/recordNumbers";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// Hands catalogue numbers to any records that don't have one yet.
//
// Every completed import already does this, so in steady state there is
// nothing here to press. It exists for the two cases where waiting for the
// next upload isn't good enough: the first deploy after this feature ships
// (the catalogue is already loaded, so no import is due, and without this the
// numbers wouldn't appear until the compiler next uploads), and cleaning up
// after an import whose best-effort numbering step failed.
//
// Safe to press repeatedly — assignMissingRecordNumbers is idempotent and
// never renumbers a record that already has a number.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  try {
    const assigned = await assignMissingRecordNumbers();
    // The detail page's number lookups are cached under this tag.
    revalidateTag(CATALOGUE_TAG, { expire: 0 });
    return NextResponse.redirect(new URL(`/admin?numbered=${assigned}`, request.url));
  } catch (err) {
    console.error("[record-numbers] assignment failed", err);
    return NextResponse.redirect(new URL("/admin?numberedError=1", request.url));
  }
}
