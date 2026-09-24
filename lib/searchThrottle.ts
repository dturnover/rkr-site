import { headers } from "next/headers";

// Per-IP rate limit shared by BOTH search entry points (/search and
// /advanced-search). It lives here rather than inline in one page because the
// two drifted once: /search was throttled and /advanced-search — which runs the
// same expensive query path under a 300s budget — was not, leaving an
// unauthenticated way to tie up long-running functions. Any future search
// surface should call this too.
//
// The limit is per IP, and mobile carriers put many subscribers behind ONE
// public address (CGNAT) — so this budget is shared by everyone on that
// carrier, not by one person. Sized for that: 40/min was comfortable for a
// single visitor but a group of real phone users arriving together (a link
// shared to a large community, say) could collectively trip it and be told
// they were "searching very quickly". A scripted abuser blows past any of these
// numbers immediately, so the higher ceiling costs no real protection —
// especially as results are cached, so this mainly caps one source firing many
// *distinct* queries (cache misses) in a burst. A genuine distributed flood is
// the platform firewall's job, not this.
export const SEARCH_RATE_LIMIT = 150; // requests
export const SEARCH_RATE_WINDOW_MS = 60_000; // per minute

// Counted IN MEMORY, per instance — not in the database.
//
// This used to go through lib/rateLimit.ts, which upserts a row per call: every
// search anyone ran was a database WRITE before it was a read, and every new
// address added a row that was never removed. A scrape through residential
// proxies brings thousands of addresses, so the table grew by one row each and
// the write bill grew with it — the protection costing more than much of what
// it protected against. lib/crawlGuard.ts was built in memory for exactly this
// reason; this is the same trade.
//
// What it gives up: the count is per instance, so a source spread across
// several warm instances gets several budgets. That was always true of a limit
// this generous, and it was never meant to stop a determined source — see the
// note above about the firewall. The contact form keeps the database-backed
// limiter, where volume is tiny and a limit that holds across instances is the
// point.
interface Window {
  count: number;
  start: number;
}
const windows = new Map<string, Window>();

/** Drops windows that have aged out, so a long-lived instance doesn't keep an
 * entry for every address it has ever seen. */
function sweep(now: number): void {
  if (windows.size < 5000) return;
  for (const [key, w] of windows) {
    if (now - w.start >= SEARCH_RATE_WINDOW_MS) windows.delete(key);
  }
}

/** Records one search from the caller's IP; false means "over the limit". */
export async function allowSearch(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  sweep(now);
  const w = windows.get(ip);
  if (!w || now - w.start >= SEARCH_RATE_WINDOW_MS) {
    windows.set(ip, { count: 1, start: now });
    return true;
  }
  w.count += 1;
  return w.count <= SEARCH_RATE_LIMIT;
}
