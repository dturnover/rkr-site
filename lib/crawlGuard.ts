import { headers } from "next/headers";
import { getClient } from "@/lib/db/client";

// Protection against one source harvesting the whole catalogue, without
// closing the site to anybody else.
//
// The catalogue is deliberately public: every record has its own page and all
// 135k are listed in the sitemap, because that is what makes the discography
// findable at all. The cost of that openness is that the entire dataset can be
// walked by anyone patient enough. This narrows the gap without giving up the
// openness — it targets *rate*, which only a machine can sustain, and never
// content, identity, or intent.
//
// Three deliberate design constraints:
//
//  1. SEARCH ENGINES ARE NEVER LIMITED. Being indexed is the whole strategic
//     advantage; throttling Googlebot to slow down a scraper would be trading
//     the thing we want for the thing we fear.
//
//  2. NO DATABASE WRITE PER PAGE VIEW. The obvious approach — the existing
//     lib/rateLimit.ts counter — writes a row per request, which on record
//     pages would turn every visit into a database write and burn the write
//     quota. Counting happens in memory instead (cheap, per instance), and the
//     database is touched only when a source has actually crossed a line.
//     Vercel Fluid compute keeps instances warm and handles many requests per
//     instance, so an in-memory window sees enough of one caller's traffic to
//     be meaningful — while a burst spread thinly across instances is, by
//     definition, not fast enough to matter.
//
//  3. IT FAILS OPEN, ALWAYS. Every error path returns "allowed". A bug or a
//     database hiccup here must never be able to take the catalogue offline.
//
// The thresholds are set well above human browsing (a fast reader opens maybe
// 20-30 pages a minute; a phone network can put hundreds of real people behind
// ONE address via CGNAT) and well below what makes bulk collection practical.
// Blocks are always temporary and always expire on their own.

const WINDOW_MS = 5 * 60_000;

// Sustained rates over a five-minute window. ~1.3 pages/second earns a
// slow-down notice; ~3/second, held for five minutes, is not a person.
const WARN_THRESHOLD = 400;
const BLOCK_THRESHOLD = 900;

/** What one page of results costs against the budget above. A results page
 * carries PAGE_SIZE records, so it buys far more of the catalogue per request
 * than a detail page does — but it's also how people legitimately browse, so
 * this is set well below the true row count. At this weight a visitor can page
 * through ~90 result pages in five minutes before anything happens. */
export const RESULTS_PAGE_WEIGHT = 10;

// Escalating, self-expiring blocks. A first offence costs a quarter of an
// hour — enough to stop a scrape, cheap enough to shrug off if we got it
// wrong. Repeat offences from the same address cost more.
const BLOCK_MINUTES = [15, 60, 360];

// Crawlers that put the catalogue in front of people looking for it. Matched
// case-insensitively as substrings, mirroring the allowances in app/robots.ts.
// Spoofable, yes — but a scraper forging Googlebot to dodge a rate limit is
// also handing us an obviously false claim, and the honest alternative
// (reverse-DNS verification per address) costs a lookup on a path that has to
// stay fast. The limit is a speed bump, not a lock.
const SEARCH_ENGINE_UA = [
  "googlebot",
  "bingbot",
  "slurp",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "applebot",
  "petalbot",
  "bravebot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "vercel", // the platform's own screenshot/preview fetchers
];

export type GuardVerdict =
  | { action: "allow" }
  | { action: "warn"; seen: number }
  | { action: "block"; retryAfterMinutes: number };

interface Window {
  count: number;
  start: number;
}

// Per-instance request counters. Never persisted: this is a rate signal, not
// a record of who read what, and it evaporates when the instance recycles.
const windows = new Map<string, Window>();

// Blocked addresses, mirrored from the database so the common case (everyone
// who isn't blocked) costs no query at all.
let blockCache = new Map<string, number>();
let blockCacheAt = 0;
const BLOCK_CACHE_MS = 30_000;

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS crawl_blocks (
          ip            TEXT PRIMARY KEY,
          strikes       INTEGER NOT NULL DEFAULT 1,
          hits          INTEGER NOT NULL DEFAULT 0,
          user_agent    TEXT,
          first_seen    TEXT NOT NULL,
          last_seen     TEXT NOT NULL,
          blocked_until INTEGER NOT NULL
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

function clientIp(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

function isSearchEngine(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return SEARCH_ENGINE_UA.some((bot) => ua.includes(bot));
}

/** Prunes counters for windows that have aged out, so a long-lived instance
 * doesn't accumulate an entry per address it has ever seen. */
function sweep(now: number): void {
  if (windows.size < 2000) return;
  for (const [key, w] of windows) {
    if (now - w.start > WINDOW_MS) windows.delete(key);
  }
}

async function loadBlocks(now: number): Promise<Map<string, number>> {
  if (now - blockCacheAt < BLOCK_CACHE_MS) return blockCache;
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT ip, blocked_until FROM crawl_blocks WHERE blocked_until > ?`,
    args: [now],
  });
  blockCache = new Map(
    res.rows.map((r) => {
      const rr = r as unknown as { ip: string; blocked_until: number };
      return [String(rr.ip), Number(rr.blocked_until)];
    })
  );
  blockCacheAt = now;
  return blockCache;
}

async function recordBlock(ip: string, userAgent: string, hits: number): Promise<number> {
  await ensureTable();
  const client = await getClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // How many times this address has been blocked before decides how long it
  // sits out this time.
  const prev = await client.execute({
    sql: `SELECT strikes FROM crawl_blocks WHERE ip = ? LIMIT 1`,
    args: [ip],
  });
  const strikes = Math.min(
    Number((prev.rows[0] as unknown as { strikes?: number })?.strikes ?? 0) + 1,
    BLOCK_MINUTES.length
  );
  const minutes = BLOCK_MINUTES[strikes - 1];
  const until = now + minutes * 60_000;

  await client.execute({
    sql: `INSERT INTO crawl_blocks (ip, strikes, hits, user_agent, first_seen, last_seen, blocked_until)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(ip) DO UPDATE SET
            strikes = ?, hits = hits + excluded.hits, user_agent = excluded.user_agent,
            last_seen = excluded.last_seen, blocked_until = excluded.blocked_until`,
    args: [ip, strikes, hits, userAgent.slice(0, 300), nowIso, nowIso, until, strikes],
  });

  blockCacheAt = 0; // force a refresh so every instance picks this up promptly
  return minutes;
}

/**
 * Call once per catalogue page view. Returns what to do with this request.
 *
 * "warn" means keep serving the page but tell them they're going fast —
 * a genuine person who has somehow tripped this can carry on reading, and an
 * unattended script gets a chance to be noticed by whoever is running it
 * before anything is actually denied.
 */
export async function checkCrawlGuard(options?: {
  weight?: number;
  /** Caller-supplied identity, for tests. Left unset in the app, where it
   * comes from the request headers. */
  ip?: string;
  userAgent?: string;
}): Promise<GuardVerdict> {
  try {
    // A results page hands over 100 records at once, so walking those is a
    // far cheaper way to take the catalogue than opening 135k detail pages.
    // Weighting them accordingly means the limits describe *records seen*
    // rather than requests made, which is the thing actually worth capping.
    const weight = Math.max(1, Math.floor(options?.weight ?? 1));

    let ip: string;
    let userAgent: string;
    if (options?.ip) {
      ip = options.ip;
      userAgent = options.userAgent ?? "";
    } else {
      const h = await headers();
      userAgent = h.get("user-agent") ?? "";
      ip = clientIp(h);
    }

    if (isSearchEngine(userAgent)) return { action: "allow" };
    if (ip === "unknown") return { action: "allow" };

    const now = Date.now();

    const blocks = await loadBlocks(now);
    const until = blocks.get(ip);
    if (until && until > now) {
      return { action: "block", retryAfterMinutes: Math.ceil((until - now) / 60_000) };
    }

    sweep(now);
    const w = windows.get(ip);
    let count: number;
    if (!w || now - w.start > WINDOW_MS) {
      windows.set(ip, { count: weight, start: now });
      count = weight;
    } else {
      w.count += weight;
      count = w.count;
    }

    if (count >= BLOCK_THRESHOLD) {
      windows.delete(ip); // start them clean when the block lifts
      const minutes = await recordBlock(ip, userAgent, count);
      return { action: "block", retryAfterMinutes: minutes };
    }
    if (count >= WARN_THRESHOLD) return { action: "warn", seen: count };

    return { action: "allow" };
  } catch {
    // Never let this be the reason the catalogue is unreachable.
    return { action: "allow" };
  }
}

export interface CrawlBlockRow {
  ip: string;
  strikes: number;
  hits: number;
  user_agent: string | null;
  first_seen: string;
  last_seen: string;
  blocked_until: number;
}

/** Every address currently or recently blocked, newest first — for the admin
 * view, so this is something that can be watched rather than just trusted. */
export async function listCrawlBlocks(limit = 100): Promise<CrawlBlockRow[]> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT ip, strikes, hits, user_agent, first_seen, last_seen, blocked_until
          FROM crawl_blocks ORDER BY last_seen DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows as unknown as CrawlBlockRow[];
}

/** Lifts a block immediately, and clears its strike history so the address
 * starts over — for when the guard has caught someone it shouldn't have. */
export async function clearCrawlBlock(ip: string): Promise<void> {
  await ensureTable();
  const client = await getClient();
  await client.execute({ sql: `DELETE FROM crawl_blocks WHERE ip = ?`, args: [ip] });
  blockCacheAt = 0;
  windows.delete(ip);
}

/** Test seam: drops the in-memory window and block caches so a test can
 * simulate time passing without waiting for it. Not used by the app. */
export async function __resetCachesForTest(): Promise<void> {
  windows.clear();
  blockCache = new Map();
  blockCacheAt = 0;
}
