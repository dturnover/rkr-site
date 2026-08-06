import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSessionCookie,
} from "@/lib/auth/session";
import { createUser, setPasswordByEmail } from "@/lib/auth/users";
import { getInvite, isInviteUsable, markInviteAccepted } from "@/lib/auth/invites";

// Public route (no session required) — the caller authenticates with the
// one-time token itself. Handles both link purposes:
//   • invite → creates the account from the name/email captured on the invite
//   • reset  → replaces the password on the existing account
// Either way the token is single-use (markInviteAccepted) and the user is
// signed in afterwards.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");

  const invite = token ? await getInvite(token) : null;
  if (!invite || !isInviteUsable(invite)) {
    return NextResponse.redirect(new URL(`/join/${token}?error=expired`, request.url));
  }
  if (password.length < 8) {
    return NextResponse.redirect(new URL(`/join/${token}?error=weak`, request.url));
  }

  let session: { uid: number; role: "admin" | "editor"; name: string };

  if (invite.purpose === "reset") {
    const user = await setPasswordByEmail(invite.email, password);
    if (!user) {
      // Account disabled or removed since the link was issued.
      return NextResponse.redirect(new URL(`/join/${token}?error=expired`, request.url));
    }
    session = { uid: user.id, role: user.role, name: user.display_name };
  } else {
    const created = await createUser({
      email: invite.email,
      displayName: invite.display_name,
      password,
      role: "editor",
    });
    if (!created.ok) {
      // duplicate-email means an account appeared in the meantime — consume the
      // invite and send them to sign in rather than looping on the link.
      if (created.error === "duplicate-email") {
        await markInviteAccepted(token);
        return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
      }
      return NextResponse.redirect(new URL(`/join/${token}?error=weak`, request.url));
    }
    session = { uid: created.id, role: "editor", name: invite.display_name };
  }

  await markInviteAccepted(token);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionCookie(session), SESSION_COOKIE_OPTIONS);

  // A brand-new editor gets the welcome guide; a returning one just goes to
  // their account page.
  return NextResponse.redirect(
    new URL(invite.purpose === "reset" ? "/admin" : "/join/welcome", request.url)
  );
}
