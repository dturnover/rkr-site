import crypto from "node:crypto";
import { getClient } from "@/lib/db/client";

// Editor invitations. The admin creates an invite (name + email, NO password);
// the invitee opens a one-time link and sets their own password, which creates
// their user row. Invites live in their own table so a pending invite carries
// no credentials and expires on its own.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

  // One pending invite per email — replace any earlier unaccepted one.
  await client.execute({
    sql: `DELETE FROM editor_invites WHERE email = ? AND accepted_at IS NULL`,
    args: [em],
  });

  const token = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO editor_invites (token, email, display_name, created_at, expires_at, accepted_at)
          VALUES (?, ?, ?, ?, ?, NULL)`,
    args: [token, em, name, new Date(now).toISOString(), new Date(now + INVITE_TTL_MS).toISOString()],
  });
  return { ok: true, token };
}

export async function getInvite(token: string): Promise<Invite | null> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT token, email, display_name, created_at, expires_at, accepted_at
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
    sql: `SELECT token, email, display_name, created_at, expires_at, accepted_at
          FROM editor_invites
          WHERE accepted_at IS NULL AND expires_at > ?
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
