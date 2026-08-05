import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { del } from "@vercel/blob";
import { isAdminAuthenticated } from "@/lib/auth/requireAdmin";
import { importAndSwap } from "@/lib/import/atomicSwap";
import { canDiff, importDiff } from "@/lib/import/diffImport";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// A full catalogue rebuild (135k+ rows, generated columns, FTS indexing) is a
// genuinely heavy one-off operation — give it the most headroom Vercel allows
// rather than the ~10s default. Requires Fluid Compute to actually grant up to
// 300s on the Hobby plan; without it this is capped at 60s. (vercel.json sets
// `fluid: true`.)
export const maxDuration = 300;

// Second half of the production upload flow (see BlobUploadForm.tsx /
// blob-token/route.ts): the browser has already PUT the file directly to
// Vercel Blob storage, bypassing our function entirely (so the 4.5MB
// serverless request-body limit never applies to the file itself — this
// route's own request body is just a small JSON URL string). We fetch the
// file back server-to-server (no size limit on outbound fetches), import
// it, then delete the blob so storage doesn't accumulate across updates.
//
// The response is STREAMED as newline-delimited JSON (NDJSON): one event per
// phase, sent as it happens, so the admin watches live progress in the browser
// instead of staring at a spinner and — critically — so that if the function
// is killed (timeout/OOM), the last event they saw pinpoints where it stopped.
// Event shapes:
//   {"type":"log","message":"…"}                          progress line
//   {"type":"done","rowCount":N,"lowRowCountWarning":b}    success
//   {"type":"error","message":"…"}                         handled failure
// A stream that just ENDS with no done/error means the platform cut the
// function off — the client reports that explicitly.
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { blobUrl } = (await request.json()) as { blobUrl?: string };
  // Restrict to Vercel's own Blob storage domains before letting the server
  // fetch() this URL. Without this, an authenticated request (or a stolen
  // admin session cookie) could make the server fetch an arbitrary internal
  // or external URL — a classic SSRF-via-server-side-fetch pattern. This
  // mirrors the same allowlist already used for the CSP connect-src.
  let parsed: URL | null = null;
  try {
    parsed = blobUrl ? new URL(blobUrl) : null;
  } catch {
    parsed = null;
  }
  const isVercelBlobHost =
    parsed?.protocol === "https:" &&
    (parsed.hostname.endsWith(".public.blob.vercel-storage.com") ||
      parsed.hostname.endsWith(".blob.vercel-storage.com"));
  if (!isVercelBlobHost || !parsed) {
    return NextResponse.json({ error: "Missing or invalid blobUrl" }, { status: 400 });
  }
  const safeUrl = parsed.href;

  const t0 = Date.now();
  const ms = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Emit one NDJSON event. Every progress line also goes to the server logs
      // (Vercel: the deployment → Logs) so there's a second record if the
      // browser tab is closed before the import finishes.
      const send = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // Controller already closed (client navigated away) — ignore.
        }
      };
      const log = (message: string) => {
        console.log(`[import ${ms()}] ${message}`);
        send({ type: "log", message });
      };

      try {
        log("Downloading the uploaded file…");
        const res = await fetch(safeUrl);
        if (!res.ok) {
          throw new Error(`Could not fetch the uploaded file (HTTP ${res.status}).`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        log(`Downloaded ${(buffer.length / 1e6).toFixed(1)} MB. Starting import…`);

        // If a catalogue is already loaded, apply only the differences (fast,
        // and the only thing that fits Turso's write budget). The very first
        // load on an empty database has nothing to diff against, so fall back
        // to a full build for that one case.
        const useDiff = await canDiff();
        const result = useDiff ? await importDiff(buffer, log) : await importAndSwap(buffer, log);

        // Flush all catalogue caches (records, search, browse, status) so the
        // new data is served immediately rather than after each cache's TTL.
        revalidateTag(CATALOGUE_TAG, { expire: 0 });
        await del(safeUrl).catch(() => {
          // Not fatal — the file just lingers in Blob storage. Import succeeded.
        });

        log(`Finished in ${ms()}.`);
        send({
          type: "done",
          rowCount: result.rowCount,
          previousRowCount: result.previousRowCount,
          lowRowCountWarning: result.lowRowCountWarning,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        console.error(`[import ${ms()}] FAILED: ${message}`, err);
        send({ type: "error", message, elapsed: ms() });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Hint to any proxy not to buffer the streamed response.
      "X-Accel-Buffering": "no",
    },
  });
}
