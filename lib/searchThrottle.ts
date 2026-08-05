import { headers } from "next/headers";
import { allowRequest } from "@/lib/rateLimit";

// Per-IP rate limit shared by BOTH search entry points (/search and
// /advanced-search). It lives here rather than inline in one page because the
// two drifted once: /search was throttled and /advanced-search — which runs the
// same expensive query path under a 300s budget — was not, leaving an
// unauthenticated way to tie up long-running functions. Any future search
// surface should call this too.
//
// Generous enough that no real person searching by hand will hit it; a
// distributed flood is the platform firewall's job. Results are cached, so this
// mainly caps one IP firing many *distinct* queries (cache misses) in a burst.
export const SEARCH_RATE_LIMIT = 40; // requests
export const SEARCH_RATE_WINDOW_MS = 60_000; // per minute

/** Records one search from the caller's IP; false means "over the limit". */
export async function allowSearch(): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return allowRequest(`search:${ip}`, SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS);
}
