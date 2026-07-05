import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { importAndSwap } from "@/lib/import/atomicSwap";

// Second half of the production upload flow (see BlobUploadForm.tsx /
// blob-token/route.ts): the browser has already PUT the file directly to
// Vercel Blob storage, bypassing our function entirely (so the 4.5MB
// serverless request-body limit never applies to the file itself — this
// route's own request body is just a small JSON URL string). We fetch the
// file back server-to-server (no size limit on outbound fetches), import
// it, then delete the blob so storage doesn't accumulate across updates.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { blobUrl } = (await request.json()) as { blobUrl?: string };
  if (!blobUrl || !blobUrl.startsWith("https://")) {
    return NextResponse.json({ error: "Missing or invalid blobUrl" }, { status: 400 });
  }

  try {
    const res = await fetch(blobUrl);
    if (!res.ok) {
      return NextResponse.json({ error: `Could not fetch uploaded file (${res.status})` }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const result = await importAndSwap(buffer);

    await del(blobUrl).catch(() => {
      // Not fatal — the file will just sit in Blob storage until manually
      // cleaned up. The import itself already succeeded.
    });

    return NextResponse.json({
      rowCount: result.rowCount,
      previousRowCount: result.previousRowCount,
      lowRowCountWarning: result.lowRowCountWarning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
