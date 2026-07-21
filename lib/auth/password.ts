import crypto from "node:crypto";

// scrypt is a deliberately slow, memory-hard KDF — the right tool for storing
// login passwords (never store or compare them in plain text). Each user gets
// a unique random salt, so identical passwords hash differently and a stolen
// hash can't be reversed with a precomputed table. Verification is
// constant-time so it can't leak how much of the hash matched.
//
// Cost: Node's scryptSync defaults to N=2^14, which measured ~56ms/hash here
// (~18 offline guesses/sec/core) — below current OWASP guidance. N is raised
// to 2^16, roughly 4x the work and ~64MB of memory per hash, which is a
// meaningful brute-force cost while still cheap enough for an occasional
// login on a serverless function (2^17 would need ~134MB per concurrent
// login, too close to the function's memory ceiling to be comfortable).
//
// The parameters are STORED WITH each hash ("scrypt$N$r$p$<hex>") so raising
// the cost again later doesn't invalidate existing passwords — a hash without
// that prefix is read back using the old Node defaults.
const KEY_LENGTH = 64;
const N = 1 << 16;
const R = 8;
const P = 1;
// scrypt needs ~128*N*r bytes; give it headroom or Node throws.
const MAXMEM = 128 * N * R * 2;

const LEGACY_OPTS = { N: 1 << 14, r: 8, p: 1, maxmem: 128 * (1 << 14) * 8 * 2 };

function derive(password: string, salt: string, opts: crypto.ScryptOptions): Buffer {
  return crypto.scryptSync(password, salt, KEY_LENGTH, opts);
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hex = derive(password, salt, { N, r: R, p: P, maxmem: MAXMEM }).toString("hex");
  return { hash: `scrypt$${N}$${R}$${P}$${hex}`, salt };
}

function parseStored(stored: string): { opts: crypto.ScryptOptions; hex: string } {
  if (!stored.startsWith("scrypt$")) {
    return { opts: LEGACY_OPTS, hex: stored };
  }
  const [, n, r, p, hex] = stored.split("$");
  const nNum = Number(n);
  const rNum = Number(r);
  const pNum = Number(p);
  return {
    opts: { N: nNum, r: rNum, p: pNum, maxmem: 128 * nNum * rNum * 2 },
    hex,
  };
}

export function verifyPassword(password: string, stored: string, salt: string): boolean {
  let candidate: Buffer;
  let expected: Buffer;
  try {
    const { opts, hex } = parseStored(stored);
    candidate = derive(password, salt, opts);
    expected = Buffer.from(hex, "hex");
  } catch {
    return false;
  }
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// Burns the same work as a real verification, for the "no such user" path.
// Without it, an unknown email returns in ~1ms while a known email with a bad
// password takes ~50ms — a timing oracle that lets an attacker enumerate which
// addresses actually have accounts (measured, then fixed).
const DUMMY_SALT = crypto.randomBytes(16).toString("hex");
export function burnPasswordWork(password: string): void {
  try {
    derive(password, DUMMY_SALT, { N, r: R, p: P, maxmem: MAXMEM });
  } catch {
    /* ignore — this exists only to consume time */
  }
}
