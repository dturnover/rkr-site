import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { importAndSwap } from "@/lib/import/atomicSwap";
import { isBodyTooLarge, UPLOAD_BODY_MAX_BYTES } from "@/lib/http/bodySizeGuard";

// Same reasoning as /api/admin/import-from-blob: a full CSV rebuild is a
// heavy one-off, give it the most headroom Vercel allows (needs Fluid
// Compute to actually reach 300s on Hobby; otherwise capped at 60s). This
// route is mainly a local-dev fallback but stays deployable for small files.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  if (isBodyTooLarge(request, UPLOAD_BODY_MAX_BYTES)) {
    return NextResponse.redirect(new URL("/admin?error=file-too-large", request.url));
  }

  const formData = await request.formData();
  const file = formData.get("csv");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.redirect(new URL("/admin?error=no-file", request.url));
  }

  if (file.size > UPLOAD_BODY_MAX_BYTES) {
    return NextResponse.redirect(new URL("/admin?error=file-too-large", request.url));
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importAndSwap(buffer);
    const params = new URLSearchParams({
      imported: String(result.rowCount),
      warning: result.lowRowCountWarning ? "1" : "0",
    });
    return NextResponse.redirect(new URL(`/admin?${params.toString()}`, request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
