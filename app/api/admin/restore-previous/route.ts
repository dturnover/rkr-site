import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { restorePrevious } from "@/lib/import/atomicSwap";

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  try {
    await restorePrevious();
    return NextResponse.redirect(new URL("/admin?restored=1", request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed";
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
