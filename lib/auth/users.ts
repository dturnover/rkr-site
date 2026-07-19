import { getClient } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "./password";

// The users table lives OUTSIDE the import-swap set (atomicSwap.ts only
// renames records/records_fts/records_catalog_fts), so editor accounts —
// like the editor overlay in later phases — survive every CSV upload.
// Ensured lazily and memoized so the CREATE runs at most once per process.
let ensured: Promise<void> | null = null;

function ensureUsersTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          email         TEXT NOT NULL UNIQUE,
          display_name  TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          role          TEXT NOT NULL DEFAULT 'editor',
          active        INTEGER NOT NULL DEFAULT 1,
          created_at    TEXT NOT NULL
        )
      `);
    })().catch((err) => {
      // Don't cache a failed ensure — allow a retry on the next call.
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export interface UserRow {
  id: number;
  email: string;
  display_name: string;
  role: "admin" | "editor";
  active: number;
  created_at: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Verifies an email + password against an ACTIVE user row. Returns the user
 * on success, or null on any failure (unknown email, wrong password,
 * deactivated). Callers should not distinguish the reasons to the client. */
export async function verifyCredentials(email: string, password: string): Promise<UserRow | null> {
  await ensureUsersTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT id, email, display_name, password_hash, password_salt, role, active, created_at
          FROM users WHERE email = ? AND active = 1 LIMIT 1`,
    args: [normalizeEmail(email)],
  });
  const row = res.rows[0] as unknown as
    | (UserRow & { password_hash: string; password_salt: string })
    | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash, row.password_salt)) return null;
  return {
    id: Number(row.id),
    email: String(row.email),
    display_name: String(row.display_name),
    role: row.role === "admin" ? "admin" : "editor",
    active: Number(row.active),
    created_at: String(row.created_at),
  };
}

export async function listUsers(): Promise<UserRow[]> {
  await ensureUsersTable();
  const client = await getClient();
  const res = await client.execute(
    `SELECT id, email, display_name, role, active, created_at FROM users ORDER BY created_at DESC`
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    display_name: String(r.display_name),
    role: r.role === "admin" ? "admin" : "editor",
    active: Number(r.active),
    created_at: String(r.created_at),
  }));
}

export type CreateUserResult =
  | { ok: true; id: number }
  | { ok: false; error: "duplicate-email" | "invalid" };

export async function createUser(input: {
  email: string;
  displayName: string;
  password: string;
  role?: "admin" | "editor";
}): Promise<CreateUserResult> {
  await ensureUsersTable();
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  if (!email.includes("@") || !displayName || input.password.length < 8) {
    return { ok: false, error: "invalid" };
  }
  const { hash, salt } = hashPassword(input.password);
  const client = await getClient();
  try {
    const res = await client.execute({
      sql: `INSERT INTO users (email, display_name, password_hash, password_salt, role, active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)`,
      args: [email, displayName, hash, salt, input.role ?? "editor", new Date().toISOString()],
    });
    return { ok: true, id: Number(res.lastInsertRowid ?? 0) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("UNIQUE") || message.includes("constraint")) {
      return { ok: false, error: "duplicate-email" };
    }
    throw err;
  }
}

export async function setUserActive(id: number, active: boolean): Promise<void> {
  await ensureUsersTable();
  const client = await getClient();
  await client.execute({
    sql: `UPDATE users SET active = ? WHERE id = ?`,
    args: [active ? 1 : 0, id],
  });
}
