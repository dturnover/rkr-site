import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { applyFieldEdits, EDITABLE_FIELDS, type EditableField } from "@/lib/editor/overlay";

// Saving an edit can touch the FTS tables and derived columns; keep the
// generous function budget the other write routes use.
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

  const incoming: Partial<Record<EditableField, string | null>> = {};
  for (const field of EDITABLE_FIELDS) {
    if (form.has(field)) incoming[field] = String(form.get(field) ?? "");
  }

  let changed = 0;
  try {
    changed = await applyFieldEdits(recordId, incoming, { uid: session.uid, name: session.name });
  } catch {
    return NextResponse.redirect(new URL(`/records/${recordId}?editError=1`, request.url));
  }

  return NextResponse.redirect(new URL(`/records/${recordId}?saved=${changed}`, request.url));
}
