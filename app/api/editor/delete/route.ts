import { NextRequest, NextResponse } from "next/server";
import { getSession, refreshEditorHint } from "@/lib/auth/requireAdmin";
import { deleteRecord } from "@/lib/editor/overlay";
import { revalidateCatalogue } from "@/lib/cacheTags";
import { getNumbersForRecordIds } from "@/lib/recordNumbers";
import { getRecordById } from "@/lib/queries/records";

// Touches the records table and both FTS indexes; keep the same generous
// budget as the other write routes.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }
  await refreshEditorHint(session.role);

  const form = await request.formData();
  const recordId = parseInt(String(form.get("recordId") ?? ""), 10);
  if (!Number.isFinite(recordId)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // The form makes you tick a box before the button does anything. Without it
  // a stray submit would wipe a record with no way back for a non-admin.
  if (String(form.get("confirm") ?? "") !== "yes") {
    return NextResponse.redirect(new URL(`/records/${recordId}/edit?deleteError=confirm`, request.url));
  }

  // The record's catalogue number has to be read now: once the row is deleted
  // it can't be found by id, but its /records/RKR-… page is still cached and
  // would go on serving the deleted record.
  const numbers = [...(await getNumbersForRecordIds([recordId])).values()];
  // Likewise its label number: the other sides of its release list it, and
  // that's the only way to know which release it was in once it's gone.
  const labelNumber = (await getRecordById(recordId))?.label_number ?? null;

  let removed = false;
  try {
    removed = await deleteRecord(recordId, { uid: session.uid, name: session.name });
  } catch {
    return NextResponse.redirect(new URL(`/records/${recordId}/edit?deleteError=1`, request.url));
  }

  if (!removed) {
    return NextResponse.redirect(new URL(`/records/${recordId}/edit?deleteError=missing`, request.url));
  }

  await revalidateCatalogue(recordId, {
    countChanged: true,
    knownNumbers: numbers,
    previousLabelNumbers: [labelNumber],
  });

  // The record page is gone, so there's nowhere on it to land — send them home
  // with a note instead of a 404.
  return NextResponse.redirect(new URL(`/?deleted=1`, request.url));
}
