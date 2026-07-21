import crypto from "node:crypto";

// The signed session cookie. It carries WHO is logged in (user id, role,
// display name) — not just "is admin" like the old single-password cookie —
// so editor attribution and role gating work. Signed with an HMAC over
// ADMIN_COOKIE_SECRET so the client can't forge or tamper with the payload;
// httpOnly/SameSite=Strict are set at the call site (login route).
export const SESSION_COOKIE_NAME = "rkr_admin";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_MAX_AGE_SECONDS = SEVEN_DAYS_SECONDS;

export type Role = "admin" | "editor";

// uid is the users-table id for a provisioned account, or the sentinel
// "env-admin" for the bootstrap admin authenticated by ADMIN_PASSWORD (which
// has no DB row, so dad can never be locked out even if the users table is
// empty or unreachable).
export interface SessionPayload {
  uid: number | "env-admin";
  role: Role;
  name: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_COOKIE_SECRET is not set. Add it to .env.local (see .env.local.example)."
    );
  }
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
}

/** base64url(payload) + "." + hmac */
export function createSessionCookie(session: Omit<SessionPayload, "exp">): string {
  const payload = JSON.stringify({ ...session, exp: Date.now() + SEVEN_DAYS_SECONDS * 1000 });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function readSessionCookie(value: string | undefined | null): SessionPayload | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;

  const expected = sign(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (payload.role !== "admin" && payload.role !== "editor") return null;
    if (typeof payload.name !== "string") return null;
    if (typeof payload.uid !== "number" && payload.uid !== "env-admin") return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Constant-time check of a candidate against the bootstrap ADMIN_PASSWORD.
 *
 * Comparing the raw buffers would require an early `a.length !== b.length`
 * return (timingSafeEqual throws on a length mismatch), and that branch is
 * itself an oracle: it reveals the real password's length, which meaningfully
 * narrows a brute-force search. Hashing both sides first makes every
 * comparison run over a fixed 32 bytes, so neither the length nor the content
 * of the guess changes the timing. */
export function checkAdminPassword(candidate: string): boolean {
  const actual = process.env.ADMIN_PASSWORD;
  if (!actual) return false;
  const a = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const b = crypto.createHash("sha256").update(actual, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}
