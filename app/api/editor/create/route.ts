import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { createRecord, EDITABLE_FIELDS, type EditableField } from "@/lib/editor/overlay";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const incoming: Partial<Record<EditableField, string | null>> = {};
  for (const field of EDITABLE_FIELDS) {
    if (form.has(field)) incoming[field] = String(form.get(field) ?? "");
  }

  // Require at least a title or artist so a blank submit doesn't create an
  // empty ghost record.
  if (!incoming.title?.trim() && !incoming.artist?.trim()) {
    return NextResponse.redirect(new URL("/records/new?createError=empty", request.url));
  }

  let newId: number;
  try {
    newId = await createRecord(incoming, { uid: session.uid, name: session.name });
  } catch {
    return NextResponse.redirect(new URL("/records/new?createError=1", request.url));
  }

  return NextResponse.redirect(new URL(`/records/${newId}?created=1`, request.url));
}
