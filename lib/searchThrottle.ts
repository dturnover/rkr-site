import { headers } from "next/headers";
import { allowRequest } from "@/lib/rateLimit";

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

/** Records one search from the caller's IP; false means "over the limit". */
export async function allowSearch(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return allowRequest(`search:${ip}`, SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS);
}
