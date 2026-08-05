import crypto from "node:crypto";
import { getClient } from "@/lib/db/client";

// One-time account links, used for two purposes that share identical mechanics
// (random token → set a password → token consumed):
//   • "invite" — a brand-new editor; accepting CREATES their user row.
//   • "reset"  — an existing editor who forgot their password; accepting
//                REPLACES the password on their existing row.
// The reset purpose exists because accounts became invite-only: an admin can no
// longer set someone's password, so without this a locked-out editor had no way
// back in at all.
// Tokens live in their own table, so a pending link carries no credentials and
// expires on its own.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type InvitePurpose = "invite" | "reset";

let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS editor_invites (
          token         TEXT PRIMARY KEY,
          email         TEXT NOT NULL,
          display_name  TEXT NOT NULL,
          created_at    TEXT NOT NULL,
          expires_at    TEXT NOT NULL,
          accepted_at   TEXT
        )
      `);
      // Older tables predate the reset purpose; existing rows are all invites.
      const info = await client.execute(`PRAGMA table_info(editor_invites)`);
      const hasPurpose = info.rows.some(
        (r) => String((r as unknown as { name: string }).name) === "purpose"
      );
      if (!hasPurpose) {
        await client.execute(
          `ALTER TABLE editor_invites ADD COLUMN purpose TEXT NOT NULL DEFAULT 'invite'`
        );
      }
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export interface Invite {
  token: string;
  email: string;
  display_name: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  purpose: InvitePurpose;
}

export type CreateInviteResult =
  | { ok: true; token: string }
  | { ok: false; error: "invalid" | "duplicate-email" };

const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function createInvite(displayName: string, email: string): Promise<CreateInviteResult> {
  await ensureTable();
  const name = displayName.trim();
  const em = normalizeEmail(email);
  if (!em.includes("@") || !name) return { ok: false, error: "invalid" };

  const client = await getClient();
  // Reject if someone already has an account with this email.
  const existing = await client
    .execute({ sql: `SELECT 1 FROM users WHERE email = ? LIMIT 1`, args: [em] })
    .catch(() => ({ rows: [] as unknown[] }));
  if (existing.rows.length > 0) return { ok: false, error: "duplicate-email" };

  // issueToken replaces any earlier pending invite for this email.
  return { ok: true, token: await issueToken(em, name, "invite") };
}

/** Issues a one-time link for `purpose`, replacing any pending link of the same
 * purpose for that email. Shared by invite and reset. */
async function issueToken(email: string, name: string, purpose: InvitePurpose): Promise<string> {
  const client = await getClient();
  await client.execute({
    sql: `DELETE FROM editor_invites WHERE email = ? AND purpose = ? AND accepted_at IS NULL`,
    args: [email, purpose],
  });
  const token = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO editor_invites (token, email, display_name, created_at, expires_at, accepted_at, purpose)
          VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    args: [
      token,
      email,
      name,
      new Date(now).toISOString(),
      new Date(now + INVITE_TTL_MS).toISOString(),
      purpose,
    ],
  });
  return token;
}

export type ResetResult = { ok: true; token: string; email: string; displayName: string } | { ok: false };

/** Creates a password-reset link for an EXISTING active user id. Returns the
 * token plus who it's for, so the caller can email it. */
export async function createPasswordReset(userId: number): Promise<ResetResult> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT email, display_name FROM users WHERE id = ? AND active = 1 LIMIT 1`,
    args: [userId],
  });
  const row = res.rows[0];
  if (!row) return { ok: false };
  const email = String(row.email);
  const displayName = String(row.display_name);
  return { ok: true, token: await issueToken(email, displayName, "reset"), email, displayName };
}

export async function getInvite(token: string): Promise<Invite | null> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT token, email, display_name, created_at, expires_at, accepted_at, purpose
          FROM editor_invites WHERE token = ? LIMIT 1`,
    args: [token],
  });
  return (res.rows[0] as unknown as Invite) ?? null;
}

export function isInviteUsable(inv: Invite): boolean {
  return !inv.accepted_at && new Date(inv.expires_at).getTime() > Date.now();
}

export async function markInviteAccepted(token: string): Promise<void> {
  await ensureTable();
  const client = await getClient();
  await client.execute({
    sql: `UPDATE editor_invites SET accepted_at = ? WHERE token = ?`,
    args: [new Date().toISOString(), token],
  });
}

/** Pending (unaccepted, unexpired) invites, newest first — for the admin panel. */
export async function listPendingInvites(): Promise<Invite[]> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT token, email, display_name, created_at, expires_at, accepted_at, purpose
          FROM editor_invites
          WHERE accepted_at IS NULL AND expires_at > ? AND purpose = 'invite'
          ORDER BY created_at DESC`,
    args: [new Date().toISOString()],
  });
  return res.rows as unknown as Invite[];
}

export async function revokeInvite(token: string): Promise<void> {
  await ensureTable();
  const client = await getClient();
  await client.execute({ sql: `DELETE FROM editor_invites WHERE token = ?`, args: [token] });
}
