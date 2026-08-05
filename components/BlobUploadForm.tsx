"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

type Status = "idle" | "uploading" | "importing" | "error";

// One line in the live progress log, with a wall-clock time so a screenshot
// shows not just where it stopped but roughly when each step happened.
interface LogLine {
  time: string;
  message: string;
  tone: "info" | "error";
}

export default function BlobUploadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const router = useRouter();
  const logBoxRef = useRef<HTMLDivElement>(null);

  const addLine = (message: string, tone: "info" | "error" = "info") => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, { time, message, tone }]);
    // Keep the newest line in view as the log grows.
    requestAnimationFrame(() => {
      const box = logBoxRef.current;
      if (box) box.scrollTop = box.scrollHeight;
    });
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("csv") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setError(null);
    setLog([]);
    setStatus("uploading");
    addLine(`Uploading “${file.name}” (${(file.size / 1e6).toFixed(1)} MB)…`);

    // Step 1: upload the file straight to Vercel Blob. Isolated in its own try
    // so a failure here is clearly labelled "upload" (vs. the import step).
    let blobUrl: string;
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/admin/blob-token",
      });
      blobUrl = blob.url;
      addLine("Upload complete. Handing off to the server to import…");
    } catch (err) {
      const message = `Upload step failed: ${err instanceof Error ? err.message : String(err)}`;
      addLine(message, "error");
      setError(message);
      setStatus("error");
      return;
    }

    // Step 2: import. The server streams NDJSON progress events back; read them
    // as they arrive and show each one live, so wherever it stops is on screen.
    setStatus("importing");
    try {
      const res = await fetch("/api/admin/import-from-blob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl }),
      });

      if (!res.ok || !res.body) {
        // A non-streamed error response (auth, bad URL, or a platform error
        // page). Read whatever came back and show it verbatim.
        const raw = await res.text();
        const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
        const message = `The server returned HTTP ${res.status}${snippet ? `: “${snippet}”` : " with no body"}.`;
        addLine(message, "error");
        setError(message);
        setStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let settled = false; // saw a terminal "done" or "error" event

      // NDJSON: split on newlines, parse each complete line as it arrives.
      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the trailing partial line
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let evt: { type?: string; message?: string; rowCount?: number; lowRowCountWarning?: boolean };
          try {
            evt = JSON.parse(trimmed);
          } catch {
            continue; // ignore anything that isn't a JSON event line
          }

          if (evt.type === "log" && evt.message) {
            addLine(evt.message);
          } else if (evt.type === "done") {
            settled = true;
            addLine("Import finished successfully. Refreshing…");
            const params = new URLSearchParams({
              imported: String(evt.rowCount ?? 0),
              warning: evt.lowRowCountWarning ? "1" : "0",
            });
            router.push(`/admin?${params.toString()}`);
            router.refresh();
            return;
          } else if (evt.type === "error") {
            settled = true;
            const message = evt.message ?? "The import failed.";
            addLine(message, "error");
            setError(message);
            setStatus("error");
            break readLoop;
          }
        }
      }

      // The stream ended without a done/error event — the function was cut off
      // by the platform (its time or memory limit). The last progress line above
      // shows exactly where. This is the diagnostic case worth screenshotting.
      if (!settled) {
        const message =
          "The server stopped responding after the last step shown above — it was cut off by its time or memory limit before finishing. The import may still be completing in the background: wait ~2 minutes, reload this page, and check the track count under “Current Catalogue.” Please screenshot this log.";
        addLine(message, "error");
        setError(message);
        setStatus("error");
      }
    } catch (err) {
      const message = `Import step failed: ${err instanceof Error ? err.message : String(err)}`;
      addLine(message, "error");
      setError(message);
      setStatus("error");
    }
  }

  const busy = status === "uploading" || status === "importing";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="file"
        name="csv"
        accept=".csv,.xlsx"
        required
        disabled={busy}
        className="font-body text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="self-start px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors disabled:opacity-60"
      >
        {status === "uploading" ? "Uploading…" : status === "importing" ? "Importing…" : "Upload & Import"}
      </button>

      {log.length > 0 && (
        <div
          ref={logBoxRef}
          className="mt-1 max-h-56 overflow-y-auto border border-paper-stain bg-parchment/40 p-3 font-mono text-xs leading-relaxed"
          aria-live="polite"
        >
          {log.map((line, i) => (
            <div key={i} className={line.tone === "error" ? "text-error" : "text-ink"}>
              <span className="text-ink-soft">{line.time}</span> {line.message}
            </div>
          ))}
          {busy && <div className="text-ink-soft animate-pulse">working…</div>}
        </div>
      )}

      {error && <p className="font-body text-sm text-error">Error: {error}</p>}
    </form>
  );
}
