// In-memory brute-force guard for the single admin login endpoint.
//
// Per-key (IP) tracking alone is not trustworthy here: the "key" the caller
// passes in is derived from a client-suppliable header (see
// clientKey() in the login route), which is only as honest as whatever
// reverse proxy sits in front of this process. Behind a proxy that
// overwrites it (e.g. Vercel's edge) that's fine; with no proxy, or a
// misconfigured one, an attacker can send a fresh fake value on every
// request and both (a) bypass the per-key lockout entirely and (b) grow
// `buckets` without bound. So this module also enforces a global ceiling
// that can't be bypassed by spoofing the key, and caps total tracked keys
// so a spoofing attacker can't use this as a memory-exhaustion vector.
//
// Good enough for a single-process deploy; a multi-instance serverless
// deploy would need a shared store (e.g. Turso/Redis) instead — revisit
// if/when this moves to Vercel.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;

const GLOBAL_MAX_ATTEMPTS = 20;
const MAX_TRACKED_KEYS = 500;

interface Bucket {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const buckets = new Map<string, Bucket>();
const globalBucket: Bucket = { failures: 0, windowStart: Date.now(), lockedUntil: 0 };

function freshBucket(now: number): Bucket {
  return { failures: 0, windowStart: now, lockedUntil: 0 };
}

function getBucket(key: string): Bucket {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = freshBucket(now);
    // Bound total memory regardless of how many distinct (possibly forged)
    // keys an attacker cycles through.
    if (buckets.size >= MAX_TRACKED_KEYS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, bucket);
  }
  return bucket;
}

function refreshGlobal(): Bucket {
  const now = Date.now();
  if (now - globalBucket.windowStart > WINDOW_MS) {
    globalBucket.failures = 0;
    globalBucket.windowStart = now;
    globalBucket.lockedUntil = 0;
  }
  return globalBucket;
}

export function isLockedOut(key: string): boolean {
  const now = Date.now();
  if (now < refreshGlobal().lockedUntil) return true;
  return now < getBucket(key).lockedUntil;
}

export function recordFailure(key: string): void {
  const bucket = getBucket(key);
  bucket.failures += 1;
  if (bucket.failures >= MAX_ATTEMPTS) {
    bucket.lockedUntil = Date.now() + LOCKOUT_MS;
  }

  const global = refreshGlobal();
  global.failures += 1;
  if (global.failures >= GLOBAL_MAX_ATTEMPTS) {
    global.lockedUntil = Date.now() + LOCKOUT_MS;
  }
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}
