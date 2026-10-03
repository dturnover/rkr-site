import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { applyCategoryCorrection, TYPO_FIELDS, type TypoField } from "@/lib/typos";
import { revalidateRecords } from "@/lib/cacheTags";

// Applying a correction touches every record with the bad value; give it room.
export const maxDuration = 120;

function isTypoField(v: string): v is TypoField {
  return (TYPO_FIELDS as readonly string[]).includes(v);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  // Admin only — not editors.
  if (session?.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const field = String(form.get("field") ?? "");
  const current = String(form.get("current") ?? "");
  const suggested = String(form.get("suggested") ?? "");

  if (!isTypoField(field) || !current || !suggested) {
    return NextResponse.redirect(new URL("/admin/typos?error=invalid", request.url));
  }

  let changed = 0;
  let ids: number[] = [];
  try {
    ({ changed, ids } = await applyCategoryCorrection(field, current, suggested, {
      uid: session.uid,
      name: session.name,
    }));
  } catch {
    return NextResponse.redirect(new URL("/admin/typos?error=apply-failed", request.url));
  }

  // Just the records that changed, rather than the whole catalogue as this used
  // to. Country, format and genre are all browse categories, so the browse
  // indexes do have to go.
  await revalidateRecords(ids, { facetsChanged: true });
  return NextResponse.redirect(new URL(`/admin/typos?applied=${changed}`, request.url));
}
