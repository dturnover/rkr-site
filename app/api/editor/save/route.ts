import { NextRequest, NextResponse } from "next/server";
import { getSession, refreshEditorHint } from "@/lib/auth/requireAdmin";
import {
  applyFieldEditsDetailed,
  EDITABLE_FIELDS,
  type EditableField,
  type FieldChange,
} from "@/lib/editor/overlay";
import { revalidateCatalogue, touchesFacets } from "@/lib/cacheTags";

// Saving an edit can touch the FTS tables and derived columns; keep the
// generous function budget the other write routes use.
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

  const incoming: Partial<Record<EditableField, string | null>> = {};
  for (const field of EDITABLE_FIELDS) {
    if (form.has(field)) incoming[field] = String(form.get(field) ?? "");
  }

  let changes: FieldChange[] = [];
  try {
    changes = await applyFieldEditsDetailed(recordId, incoming, {
      uid: session.uid,
      name: session.name,
    });
  } catch {
    return NextResponse.redirect(new URL(`/records/${recordId}/edit?editError=1`, request.url));
  }

  // Reflect the edit immediately across cached record/search/browse views.
  const changed = changes.length;
  // Only a change to a browse-category field (artist, label, country, year…)
  // can alter a browse index, and those are the expensive caches to rebuild —
  // so a matrix-number or title correction leaves them alone. A changed label
  // number also leaves its old release, whose other sides still list it.
  if (changed > 0) {
    await revalidateCatalogue(recordId, {
      facetsChanged: touchesFacets(changes.map((c) => c.field)),
      previousLabelNumbers: changes.filter((c) => c.field === "label_number").map((c) => c.oldValue),
    });
  }

  return NextResponse.redirect(new URL(`/records/${recordId}/edit?saved=${changed}`, request.url));
}
