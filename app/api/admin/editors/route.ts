import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/requireAdmin";
import { setUserActive } from "@/lib/auth/users";
import { createInvite, revokeInvite } from "@/lib/auth/invites";
import { sendInviteEmail } from "@/lib/email/sendInvite";

// Admin-only provisioning of editor accounts. Every action re-checks admin
// server-side; an editor session must never be able to invite accounts or
// change access. Posts back to /admin with a status param so the page can
// show a banner (the admin UI is a plain form, no client JS required).
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  // Invite: the admin supplies only a name + email. No password is chosen here
  // — the invitee sets their own via the emailed link, which is what creates
  // their account. We try to email the link; if no email provider is wired up
  // (or the send fails), the admin panel shows a copyable link instead.
  if (action === "invite") {
    const displayName = String(form.get("displayName") ?? "");
    const email = String(form.get("email") ?? "");
    const result = await createInvite(displayName, email);
    if (!result.ok) {
      return NextResponse.redirect(new URL(`/admin?editorError=${result.error}`, request.url));
    }
    const sent = await sendInviteEmail({ to: email.trim().toLowerCase(), displayName, token: result.token });
    return NextResponse.redirect(
      new URL(`/admin?invited=${sent ? "sent" : "link"}`, request.url)
    );
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
