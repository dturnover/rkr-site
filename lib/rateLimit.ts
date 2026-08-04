import { getClient } from "@/lib/db/client";

// Generic fixed-window, per-key request limiter — defense-in-depth against a
// single source hammering an expensive public endpoint (search). Modeled on the
// login brute-force guard (lib/auth/loginRateLimit.ts): counters live in the
// database, not in memory, because each Vercel serverless instance has its own
// memory and cold starts reset it, so an in-memory counter wouldn't actually
// hold across the fleet. This only stops one abusive IP; a distributed flood is
// the platform firewall's job (Vercel Attack Challenge Mode), not this.

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS request_rate_limits (
          key          TEXT PRIMARY KEY,
          count        INTEGER NOT NULL,
          window_start INTEGER NOT NULL
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

/**
 * Records one request against `key` and returns whether it's allowed — i.e. the
 * key is at or below `limit` within the current `windowMs` window. The window
 * resets lazily once it has aged out. Fails OPEN on any database error so a
 * transient DB issue can never take search offline; the worst case of a hiccup
 * is that the limit isn't enforced for that request.
 */
export async function allowRequest(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  try {
    await ensureTable();
    const client = await getClient();
    const now = Date.now();
    const windowFloor = now - windowMs;

    // Single atomic upsert: start a fresh window (count = 1) if the stored
    // window has aged out, otherwise increment. RETURNING gives us the post-
    // update count so we can decide in one round-trip.
    const res = await client.execute({
      sql: `INSERT INTO request_rate_limits (key, count, window_start)
            VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET
              count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
              window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END
            RETURNING count`,
      args: [key, now, windowFloor, windowFloor, now],
    });

    const count = Number((res.rows[0] as unknown as { count: number })?.count ?? 0);
    return count <= limit;
  } catch {
    return true;
  }
}
