import { getClient } from "@/lib/db/client";

// Database-backed brute-force guard for the login endpoint.
//
// This replaces an in-memory counter whose own comment flagged the problem:
// it only works for a single long-lived process, and the site runs on Vercel
// serverless. Each instance had its own counters (and cold starts reset them),
// so the "5 attempts then locked out" rule was far weaker in practice than it
// looked — exactly the wrong place to be optimistic now that real editor
// credentials are behind it. Counters live in the database so every instance
// sees the same state.
//
// Two independent keys are checked per attempt:
//   ip:<addr>     — throttles one source hammering many accounts
//   email:<addr>  — throttles many sources hammering ONE account, which the
//                   IP key alone can't catch (a distributed guess spread over
//                   many addresses looked like one failure each).

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          key          TEXT PRIMARY KEY,
          failures     INTEGER NOT NULL,
          window_start INTEGER NOT NULL,
          locked_until INTEGER NOT NULL DEFAULT 0
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export function loginKeys(ip: string, email: string): string[] {
  const keys = [`ip:${ip}`];
  const e = email.trim().toLowerCase();
  if (e) keys.push(`email:${e}`);
  return keys;
}

/** True if any of the supplied keys is currently locked out. Fails OPEN on a
 * database error so a transient outage can't lock everyone out of the site —
 * the password check itself still has to pass. */
export async function isLockedOut(keys: string[]): Promise<boolean> {
  try {
    await ensureTable();
    const client = await getClient();
    const now = Date.now();
    const placeholders = keys.map(() => "?").join(",");
    const res = await client.execute({
      sql: `SELECT 1 FROM login_attempts WHERE key IN (${placeholders}) AND locked_until > ? LIMIT 1`,
      args: [...keys, now],
    });
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

export async function recordFailure(keys: string[]): Promise<void> {
  try {
    await ensureTable();
    const client = await getClient();
    const now = Date.now();
    const windowFloor = now - WINDOW_MS;

    await client.batch(
      keys.flatMap((key) => [
        // Start a fresh window if the previous one has aged out.
        {
          sql: `INSERT INTO login_attempts (key, failures, window_start, locked_until)
                VALUES (?, 0, ?, 0)
                ON CONFLICT(key) DO UPDATE SET
                  failures     = CASE WHEN login_attempts.window_start < ? THEN 0 ELSE login_attempts.failures END,
                  window_start = CASE WHEN login_attempts.window_start < ? THEN ? ELSE login_attempts.window_start END`,
          args: [key, now, windowFloor, windowFloor, now],
        },
        {
          sql: `UPDATE login_attempts SET failures = failures + 1 WHERE key = ?`,
          args: [key],
        },
        {
          sql: `UPDATE login_attempts SET locked_until = ?
                WHERE key = ? AND failures >= ? AND locked_until <= ?`,
          args: [now + LOCKOUT_MS, key, MAX_ATTEMPTS, now],
        },
      ]),
      "write"
    );
  } catch {
    /* never let bookkeeping failure block the login response */
  }
}

export async function recordSuccess(keys: string[]): Promise<void> {
  try {
    await ensureTable();
    const client = await getClient();
    const placeholders = keys.map(() => "?").join(",");
    await client.execute({
      sql: `DELETE FROM login_attempts WHERE key IN (${placeholders})`,
      args: keys,
    });
  } catch {
    /* non-fatal */
  }
}
