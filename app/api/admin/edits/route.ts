import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdmin } from "@/lib/auth/requireAdmin";
import { removeFieldEdit } from "@/lib/editor/overlay";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// Admin-only management of the field-override overlay. Currently one action —
// removing an override (which reverts the live record to dad's original value
// when it can still be located, and always stops the override re-applying on
// future imports).
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "remove") {
    const recordKey = String(form.get("record_key") ?? "");
    const field = String(form.get("field") ?? "");
    if (recordKey && field) {
      const reverted = await removeFieldEdit(recordKey, field);
      revalidateTag(CATALOGUE_TAG, { expire: 0 });
      return NextResponse.redirect(
        new URL(`/admin/edits?removed=${reverted ? "reverted" : "pending"}`, request.url)
      );
    }
  }

  return NextResponse.redirect(new URL("/admin/edits", request.url));
}
