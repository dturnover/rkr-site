import { getClient } from "@/lib/db/client";
import { sendEmail, escapeHtml } from "@/lib/email/send";

// Contact-form handling. Messages are ALWAYS written to the database first and
// emailed second: email is best-effort (the provider can be unconfigured, rate
// limited, or down), and a contact form that silently loses a message is worse
// than no form at all. Anything that fails to send still shows up in
// /admin/messages.

/** Where contact messages are delivered. Overridable without a code change. */
export function contactRecipient(): string {
  return process.env.CONTACT_EMAIL?.trim() || "oldbroom1@gmail.com";
}

const MAX_NAME = 120;
const MAX_MESSAGE = 5000;
const MIN_MESSAGE = 10;

let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS contact_messages (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          email      TEXT NOT NULL,
          message    TEXT NOT NULL,
          created_at TEXT NOT NULL,
          emailed    INTEGER NOT NULL DEFAULT 0
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  message: string;
  created_at: string;
  emailed: boolean;
}

export type ContactInput = { name: string; email: string; message: string };
export type ContactResult =
  | { ok: true; emailed: boolean }
  | { ok: false; error: "invalid" };

function valid(input: ContactInput): boolean {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  return (
    name.length > 0 &&
    name.length <= MAX_NAME &&
    email.includes("@") &&
    email.length <= 254 &&
    message.length >= MIN_MESSAGE &&
    message.length <= MAX_MESSAGE
  );
}

/** Stores the message, then tries to email it. Storage failing is fatal (we
 * would lose the message); emailing failing is not. */
export async function submitContact(input: ContactInput): Promise<ContactResult> {
  if (!valid(input)) return { ok: false, error: "invalid" };

  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `INSERT INTO contact_messages (name, email, message, created_at, emailed)
          VALUES (?, ?, ?, ?, 0)`,
    args: [name, email, message, new Date().toISOString()],
  });
  const id = Number(res.lastInsertRowid ?? 0);

  // reply_to is set to the sender, so hitting Reply in the inbox goes straight
  // back to them rather than to the site's own from-address.
  const sent = await sendEmail({
    to: contactRecipient(),
    replyTo: email,
    subject: `Roots Knotty Roots — message from ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
    html:
      `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>` +
      `<hr>` +
      `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
  });

  if (sent.ok && id) {
    await client
      .execute({ sql: `UPDATE contact_messages SET emailed = 1 WHERE id = ?`, args: [id] })
      .catch(() => {});
  } else if (!sent.ok && sent.reason === "failed") {
    console.error(`[contact] message ${id} stored but email failed: ${sent.detail}`);
  }

  return { ok: true, emailed: sent.ok };
}

/** Newest first, for the admin inbox. */
export async function listContactMessages(limit = 200): Promise<ContactMessage[]> {
  await ensureTable();
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT id, name, email, message, created_at, emailed
          FROM contact_messages ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    email: String(r.email),
    message: String(r.message),
    created_at: String(r.created_at),
    emailed: Number(r.emailed) === 1,
  }));
}

export async function deleteContactMessage(id: number): Promise<void> {
  await ensureTable();
  const client = await getClient();
  await client.execute({ sql: `DELETE FROM contact_messages WHERE id = ?`, args: [id] });
}
