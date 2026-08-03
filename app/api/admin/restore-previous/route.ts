import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { restorePrevious } from "@/lib/import/atomicSwap";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  try {
    await restorePrevious();
    revalidateTag(CATALOGUE_TAG, { expire: 0 });
    return NextResponse.redirect(new URL("/admin?restored=1", request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
