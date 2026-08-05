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

    // Step 2: import — possibly across several automatic passes. A big first
    // import (or any change larger than one server invocation can apply) reports
    // itself incomplete; we simply call again with resume=true until it's done.
    // Each pass streams NDJSON progress events we render live.
    setStatus("importing");
    const MAX_PASSES = 100; // generous cap; also absorbs the occasional retry

    type PassResult =
      | { kind: "complete"; rowCount: number; lowRowCountWarning: boolean }
      | { kind: "incomplete" } // clean "more to do" from the server
      | { kind: "cutoff" } // stream ended mid-pass; committed progress persists
      | { kind: "error"; message: string }
      | { kind: "http-error"; message: string };

    async function runPass(resume: boolean): Promise<PassResult> {
      const res = await fetch("/api/admin/import-from-blob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl, resume }),
      });
      if (!res.ok || !res.body) {
        const raw = await res.text();
        const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 200);
        return {
          kind: "http-error",
          message: `The server returned HTTP ${res.status}${snippet ? `: “${snippet}”` : " with no body"}.`,
        };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let terminal: PassResult | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          let evt: {
            type?: string; message?: string; complete?: boolean;
            rowCount?: number; lowRowCountWarning?: boolean;
          };
          try { evt = JSON.parse(t); } catch { continue; }
          if (evt.type === "log" && evt.message) addLine(evt.message);
          else if (evt.type === "done")
            terminal = evt.complete === false
              ? { kind: "incomplete" }
              : { kind: "complete", rowCount: evt.rowCount ?? 0, lowRowCountWarning: !!evt.lowRowCountWarning };
          else if (evt.type === "error") terminal = { kind: "error", message: evt.message ?? "The import failed." };
        }
      }
      return terminal ?? { kind: "cutoff" };
    }

    const sleep = (msWait: number) => new Promise((r) => setTimeout(r, msWait));
    let transportErrors = 0; // consecutive network/transport blips

    try {
      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        if (pass > 1) addLine(`Continuing (pass ${pass})…`);

        let result: PassResult;
        try {
          result = await runPass(pass > 1);
        } catch (err) {
          // fetch/stream threw (dropped connection, DNS, etc.) — treat as a
          // transport blip and retry, since server-side progress is committed.
          result = { kind: "http-error", message: err instanceof Error ? err.message : String(err) };
        }

        if (result.kind === "complete") {
          addLine("Import finished successfully. Refreshing…");
          const params = new URLSearchParams({
            imported: String(result.rowCount),
            warning: result.lowRowCountWarning ? "1" : "0",
          });
          router.push(`/admin?${params.toString()}`);
          router.refresh();
          return;
        }

        // A server-REPORTED error (bad file, DB failure) is a real stop.
        if (result.kind === "error") {
          addLine(result.message, "error");
          setError(result.message);
          setStatus("error");
          return;
        }

        // A transport error (network blip, dropped fetch) is NOT fatal — every
        // completed batch is already saved, so wait briefly and resume. Give up
        // only after several in a row.
        if (result.kind === "http-error") {
          transportErrors++;
          if (transportErrors >= 8) {
            const m = "Too many network errors in a row. Your progress is saved — reload the page and upload the same file again to continue where it left off.";
            addLine(m, "error");
            setError(m);
            setStatus("error");
            return;
          }
          addLine(`Network hiccup (${result.message}). Retrying in a few seconds…`);
          await sleep(4000);
          continue;
        }

        // incomplete or cutoff → committed progress persists; loop to resume.
        transportErrors = 0;
        if (result.kind === "cutoff") {
          addLine("Connection dropped mid-import — resuming from where it left off…");
        }
      }
      const capMsg = "Stopped after many passes. Progress is saved — reload and upload the same file again to continue.";
      addLine(capMsg, "error");
      setError(capMsg);
      setStatus("error");
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
