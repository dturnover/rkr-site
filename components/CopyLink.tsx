"use client";

import { useState } from "react";

// A small copy-to-clipboard button for the pending-invite links in the admin
// panel. The link text is shown too, so it works even if the clipboard API is
// blocked (older browser, insecure context) — the admin can select it by hand.
export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the URL is visible for manual selection.
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <code className="font-body text-xs text-ink-soft truncate bg-parchment/40 px-1.5 py-0.5 border border-paper-stain/50">
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
