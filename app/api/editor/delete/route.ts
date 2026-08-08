import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/requireAdmin";
import { deleteRecord } from "@/lib/editor/overlay";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// Touches the records table and both FTS indexes; keep the same generous
// budget as the other write routes.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const recordId = parseInt(String(form.get("recordId") ?? ""), 10);
  if (!Number.isFinite(recordId)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // The form makes you tick a box before the button does anything. Without it
  // a stray submit would wipe a record with no way back for a non-admin.
  if (String(form.get("confirm") ?? "") !== "yes") {
    return NextResponse.redirect(new URL(`/records/${recordId}?deleteError=confirm`, request.url));
  }

  let removed = false;
  try {
    removed = await deleteRecord(recordId, { uid: session.uid, name: session.name });
  } catch {
    return NextResponse.redirect(new URL(`/records/${recordId}?deleteError=1`, request.url));
  }

  if (!removed) {
    return NextResponse.redirect(new URL(`/records/${recordId}?deleteError=missing`, request.url));
  }

  revalidateTag(CATALOGUE_TAG, { expire: 0 });

  // The record page is gone, so there's nowhere on it to land — send them home
  // with a note instead of a 404.
  return NextResponse.redirect(new URL(`/?deleted=1`, request.url));
}
