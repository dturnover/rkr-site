import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/requireAdmin";
import { removeFieldEdit, restoreDeletedRecord } from "@/lib/editor/overlay";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// Admin-only management of the editor overlay: removing a field override
// (which reverts the live record to dad's original value when it can still be
// located, and always stops the override re-applying on future imports), and
// undoing a record deletion.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "restore") {
    const recordKey = String(form.get("record_key") ?? "");
    if (recordKey) {
      await restoreDeletedRecord(recordKey, { uid: session.uid, name: session.name });
      // Nothing changes on the live site until the next upload re-materialises
      // the row, but drop the cache anyway so the admin list is accurate.
      revalidateTag(CATALOGUE_TAG, { expire: 0 });
      return NextResponse.redirect(new URL(`/admin/edits?restored=1`, request.url));
    }
  }

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
