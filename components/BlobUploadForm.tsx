"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upload } from "@vercel/blob/client";

type Status = "idle" | "uploading" | "importing" | "error";

export default function BlobUploadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("csv") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setError(null);
    setStatus("uploading");

    // Step 1: upload the file straight to Vercel Blob. Isolated in its own
    // try so a failure here is clearly labelled "upload" (vs. the import step).
    let blobUrl: string;
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/admin/blob-token",
      });
      blobUrl = blob.url;
    } catch (err) {
      setError(`Upload step failed: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("error");
      return;
    }

    // Step 2: import the uploaded file.
    setStatus("importing");
    try {
      const res = await fetch("/api/admin/import-from-blob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl }),
      });

      // A large import can outlast the serverless function's time limit. When
      // that happens the platform — not our handler — returns a plain-text
      // error page, so res.json() would throw a cryptic "Unexpected token"
      // instead of telling dad what actually happened. Read the raw body and
      // parse defensively.
      const raw = await res.text();
      let data: { rowCount?: number; lowRowCountWarning?: boolean; error?: string } | null = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }

      if (!data) {
        // Non-JSON response = the request was cut off (usually a timeout on a
        // very large catalogue). Surface the actual status and a snippet of the
        // response so a screenshot pins down the cause; the import may still be
        // finishing server-side, so also tell dad to reload and check.
        const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 160);
        setError(
          `The import didn't return a normal result (HTTP ${res.status}). ` +
            (snippet ? `Server said: “${snippet}”. ` : "") +
            "A very large catalogue can run past the time limit; it may still be finishing — wait ~2 minutes, reload this page, and check the track count under “Current Catalogue” before trying again."
        );
        setStatus("error");
        return;
      }

      if (!res.ok) {
        setError(`Import failed (HTTP ${res.status}): ${data.error ?? "unknown error"}`);
        setStatus("error");
        return;
      }

      const params = new URLSearchParams({
        imported: String(data.rowCount ?? 0),
        warning: data.lowRowCountWarning ? "1" : "0",
      });
      router.push(`/admin?${params.toString()}`);
      router.refresh();
    } catch (err) {
      setError(`Import step failed: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("error");
    }
  }

  const busy = status === "uploading" || status === "importing";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input type="file" name="csv" accept=".csv,.xlsx" required disabled={busy} className="font-body text-sm" />
      <button
        type="submit"
        disabled={busy}
        className="self-start px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors disabled:opacity-60"
      >
        {status === "uploading"
          ? "Uploading…"
          : status === "importing"
            ? "Importing…"
            : "Upload & Import"}
      </button>
      {error && <p className="font-body text-sm text-error">Error: {error}</p>}
    </form>
  );
}
