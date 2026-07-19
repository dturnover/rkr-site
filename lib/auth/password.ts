import crypto from "node:crypto";

// scrypt is a deliberately slow, memory-hard KDF — the right tool for storing
// login passwords (never store or compare them in plain text). Each user gets
// a unique random salt, so identical passwords hash differently and a stolen
// hash can't be reversed with a precomputed table. Verification is
// constant-time to avoid leaking how much of the hash matched.
const KEY_LENGTH = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  let candidate: Buffer;
  try {
    candidate = crypto.scryptSync(password, salt, KEY_LENGTH);
  } catch {
    return false;
  }
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
