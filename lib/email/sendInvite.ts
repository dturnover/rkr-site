import { SITE_URL } from "@/lib/siteUrl";

// Sends the editor-invite email via Resend (https://resend.com), the only
// dependency-free way to send mail from a serverless function here — one HTTPS
// POST, no SDK. It is DELIBERATELY optional: if RESEND_API_KEY or
// INVITE_FROM_EMAIL is unset, or the send fails, this returns false instead of
// throwing, and the admin flow falls back to showing a copyable invite link.
// So the feature works before any email provider is wired up.

export function inviteUrl(token: string): string {
  return `${SITE_URL}/join/${token}`;
}

interface SendInviteArgs {
  to: string;
  displayName: string;
  token: string;
}

/** Returns true only if the email was accepted by Resend. Never throws. */
export async function sendInviteEmail({ to, displayName, token }: SendInviteArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITE_FROM_EMAIL?.trim();
  if (!apiKey || !from) return false;

  const link = inviteUrl(token);
  const subject = "You've been invited to edit the Roots Knotty Roots catalogue";
  const text =
    `Hi ${displayName},\n\n` +
    `You've been invited to help maintain the Roots Knotty Roots discography.\n\n` +
    `Open this link to set your password and get started:\n${link}\n\n` +
    `The link is good for 7 days. If you weren't expecting this, you can ignore it.`;
  const html =
    `<p>Hi ${escapeHtml(displayName)},</p>` +
    `<p>You've been invited to help maintain the <strong>Roots Knotty Roots</strong> discography.</p>` +
    `<p><a href="${link}">Set your password and get started</a></p>` +
    `<p style="color:#666;font-size:13px">The link is good for 7 days. If you weren't expecting this, you can ignore it.</p>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
