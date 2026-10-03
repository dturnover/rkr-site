import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { dismissTypo, TYPO_FIELDS, type TypoField } from "@/lib/typos";
import { revalidateTag } from "next/cache";
import { TYPOS_TAG } from "@/lib/cacheTags";

function isTypoField(v: string): v is TypoField {
  return (TYPO_FIELDS as readonly string[]).includes(v);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const field = String(form.get("field") ?? "");
  const current = String(form.get("current") ?? "");

  if (!isTypoField(field) || !current) {
    return NextResponse.redirect(new URL("/admin/typos?error=invalid", request.url));
  }

  try {
    await dismissTypo(field, current);
  } catch {
    return NextResponse.redirect(new URL("/admin/typos?error=dismiss-failed", request.url));
  }

  // Refresh the cached suggestion list so the dismissed item drops off.
  // Only the suggestion list changes when one is set aside — no record does.
  // This used to call revalidateCatalogue(), the after-an-import flush, which
  // dropped every cached record page in the site on each click.
  revalidateTag(TYPOS_TAG, { expire: 0 });
  return NextResponse.redirect(new URL("/admin/typos?dismissed=1", request.url));
}
