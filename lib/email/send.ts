import { SITE_URL } from "@/lib/siteUrl";

// Transactional email via Resend (https://resend.com) — one HTTPS POST, no SDK
// dependency. Email is OPTIONAL: with RESEND_API_KEY / INVITE_FROM_EMAIL unset
// the app still works, and the admin panel falls back to a copyable link.
//
// Sends return a structured result rather than a bare boolean so the admin can
// see WHY a send failed (bad key, unverified sender domain, rate limit) instead
// of the misleading catch-all "no mail provider configured" — that ambiguity
// made a misconfiguration impossible to diagnose from the UI.

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" }
  | { ok: false; reason: "failed"; detail: string };

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.INVITE_FROM_EMAIL?.trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Low-level send. Never throws; network/API failures come back as a result. */
export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Sets Reply-To, so replying reaches the real person (contact form). */
  replyTo?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITE_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { ok: false, reason: "not-configured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        text: args.text,
        html: args.html,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });
    if (res.ok) return { ok: true };

    // Resend returns a JSON body with a human-readable `message` on failure
    // (e.g. "The domain is not verified", "API key is invalid"). Surface it.
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; name?: string };
      if (body?.message) detail = body.message;
      else if (body?.name) detail = body.name;
    } catch {
      /* non-JSON error body — keep the status code */
    }
    return { ok: false, reason: "failed", detail };
  } catch (err) {
    return { ok: false, reason: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

const SIGNATURE =
  `<p style="color:#666;font-size:13px">Roots Knotty Roots &mdash; ${SITE_URL}</p>`;

export function joinUrl(token: string): string {
  return `${SITE_URL}/join/${token}`;
}

/** Back-compat alias — the admin panel labels these links "invite links". */
export const inviteUrl = joinUrl;

export async function sendInviteEmail(args: {
  to: string;
  displayName: string;
  token: string;
}): Promise<SendResult> {
  const link = joinUrl(args.token);
  return sendEmail({
    to: args.to,
    subject: "You've been invited to edit the Roots Knotty Roots catalogue",
    text:
      `Hi ${args.displayName},\n\n` +
      `You've been invited to help maintain the Roots Knotty Roots discography.\n\n` +
      `Open this link to set your password and get started:\n${link}\n\n` +
      `The link is good for 7 days. If you weren't expecting this, you can ignore it.`,
    html:
      `<p>Hi ${escapeHtml(args.displayName)},</p>` +
      `<p>You've been invited to help maintain the <strong>Roots Knotty Roots</strong> discography.</p>` +
      `<p><a href="${link}">Set your password and get started</a></p>` +
      `<p style="color:#666;font-size:13px">The link is good for 7 days. If you weren't expecting this, you can ignore it.</p>` +
      SIGNATURE,
  });
}

export async function sendPasswordResetEmail(args: {
  to: string;
  displayName: string;
  token: string;
}): Promise<SendResult> {
  const link = joinUrl(args.token);
  return sendEmail({
    to: args.to,
    subject: "Reset your Roots Knotty Roots password",
    text:
      `Hi ${args.displayName},\n\n` +
      `Use this link to choose a new password for your editor account:\n${link}\n\n` +
      `The link is good for 7 days and can only be used once. If you didn't ask for ` +
      `this, you can ignore it — your current password keeps working.`,
    html:
      `<p>Hi ${escapeHtml(args.displayName)},</p>` +
      `<p>Use this link to choose a new password for your editor account:</p>` +
      `<p><a href="${link}">Choose a new password</a></p>` +
      `<p style="color:#666;font-size:13px">The link is good for 7 days and can only be used once. ` +
      `If you didn't ask for this, you can ignore it &mdash; your current password keeps working.</p>` +
      SIGNATURE,
  });
}

/** Used by the admin panel's "send a test email" check, so email configuration
 * can be verified without inviting a real person. */
export async function sendTestEmail(to: string): Promise<SendResult> {
  return sendEmail({
    to,
    subject: "Roots Knotty Roots — test email",
    text:
      `This is a test from the Roots Knotty Roots admin page.\n\n` +
      `If you're reading it, invite and password-reset emails will send correctly.`,
    html:
      `<p>This is a test from the Roots Knotty Roots admin page.</p>` +
      `<p>If you're reading it, invite and password-reset emails will send correctly.</p>` +
      SIGNATURE,
  });
}
