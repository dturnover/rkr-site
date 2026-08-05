import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/requireAdmin";
import { setUserActive } from "@/lib/auth/users";
import { createInvite, createPasswordReset, getInvite, revokeInvite } from "@/lib/auth/invites";
import {
  sendInviteEmail,
  sendPasswordResetEmail,
  sendTestEmail,
  type SendResult,
} from "@/lib/email/send";

// Admin-only provisioning of editor accounts. Every action re-checks admin
// server-side; an editor session must never be able to invite accounts, reset
// passwords, or change access. Posts back to /admin with a status param so the
// page can show a banner (the admin UI is plain forms, no client JS required).

// Turns a send result into redirect params so the admin sees exactly why an
// email didn't go out (unverified domain, bad key, …) instead of a vague
// "not sent" — the ambiguity made misconfiguration impossible to diagnose.
function sendParams(prefix: string, result: SendResult): string {
  if (result.ok) return `${prefix}=sent`;
  if (result.reason === "not-configured") return `${prefix}=link`;
  return `${prefix}=failed&mailError=${encodeURIComponent(result.detail.slice(0, 200))}`;
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  // Invite: the admin supplies only a name + email. No password is chosen here
  // — the invitee sets their own via the emailed link, which is what creates
  // their account. If no mail provider is configured (or the send fails), the
  // admin panel shows a copyable link instead.
  if (action === "invite") {
    const displayName = String(form.get("displayName") ?? "");
    const email = String(form.get("email") ?? "");
    const result = await createInvite(displayName, email);
    if (!result.ok) {
      return NextResponse.redirect(new URL(`/admin?editorError=${result.error}`, request.url));
    }
    const sent = await sendInviteEmail({
      to: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      token: result.token,
    });
    return NextResponse.redirect(new URL(`/admin?${sendParams("invited", sent)}`, request.url));
  }

  // Re-send the email for an existing pending invite (same token/link).
  if (action === "resend-invite") {
    const token = String(form.get("token") ?? "");
    const invite = token ? await getInvite(token) : null;
    if (!invite) return NextResponse.redirect(new URL("/admin", request.url));
    const sent = await sendInviteEmail({
      to: invite.email,
      displayName: invite.display_name,
      token: invite.token,
    });
    return NextResponse.redirect(new URL(`/admin?${sendParams("invited", sent)}`, request.url));
  }

  // Password reset for an EXISTING editor. Accounts are invite-only and an
  // admin can't set someone's password, so this is the only recovery path for a
  // locked-out editor.
  if (action === "reset-password") {
    const id = parseInt(String(form.get("id") ?? ""), 10);
    if (!Number.isFinite(id)) return NextResponse.redirect(new URL("/admin", request.url));
    const reset = await createPasswordReset(id);
    if (!reset.ok) {
      return NextResponse.redirect(new URL("/admin?editorError=no-user", request.url));
    }
    const sent = await sendPasswordResetEmail({
      to: reset.email,
      displayName: reset.displayName,
      token: reset.token,
    });
    // On success there's nothing to show; if email isn't available, hand the
    // admin the link to pass along by hand.
    const params = sent.ok
      ? "reset=sent"
      : sent.reason === "not-configured"
        ? `reset=link&resetToken=${encodeURIComponent(reset.token)}`
        : `reset=failed&mailError=${encodeURIComponent(sent.detail.slice(0, 200))}&resetToken=${encodeURIComponent(reset.token)}`;
    return NextResponse.redirect(new URL(`/admin?${params}`, request.url));
  }

  // Verifies email configuration without involving a real editor.
  if (action === "test-email") {
    const to = String(form.get("testEmail") ?? "").trim();
    if (!to.includes("@")) {
      return NextResponse.redirect(new URL("/admin?mailTest=invalid", request.url));
    }
    const sent = await sendTestEmail(to);
    return NextResponse.redirect(new URL(`/admin?${sendParams("mailTest", sent)}`, request.url));
  }

  // Revoke a pending (unaccepted) invite.
  if (action === "revoke-invite") {
    const token = String(form.get("token") ?? "");
    if (token) await revokeInvite(token);
    return NextResponse.redirect(new URL("/admin?inviteRevoked=1", request.url));
  }

  if (action === "deactivate" || action === "reactivate") {
    const id = parseInt(String(form.get("id") ?? ""), 10);
    if (Number.isFinite(id)) {
      await setUserActive(id, action === "reactivate");
    }
    return NextResponse.redirect(new URL("/admin?editorUpdated=1", request.url));
  }

  return NextResponse.redirect(new URL("/admin", request.url));
}
