import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";

// Issues short-lived client tokens for direct-to-Blob uploads (see
// components/BlobUploadForm.tsx). Only reached in production, where
// BLOB_READ_WRITE_TOKEN is set — see app/admin/page.tsx for the local-dev
// fallback that skips Blob entirely. Gating on admin auth happens for the
// whole route up front, so onBeforeGenerateToken itself doesn't need to
// re-derive who's asking — anyone who got this far is already authenticated.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["text/csv", "application/vnd.ms-excel", "application/octet-stream"],
        maximumSizeInBytes: 300 * 1024 * 1024,
        addRandomSuffix: true,
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to issue upload token";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
