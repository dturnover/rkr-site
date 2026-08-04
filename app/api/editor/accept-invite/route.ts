import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookie,
} from "@/lib/auth/session";
import { createUser } from "@/lib/auth/users";
import { getInvite, isInviteUsable, markInviteAccepted } from "@/lib/auth/invites";

// Public route (no session required) — the caller authenticates with the
// invite token itself. It creates the editor's account from the name + email
// captured on the invite, using the password THEY chose here, then signs them
// in. The token is single-use: markInviteAccepted stops it working again.
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

  const created = await createUser({
    email: invite.email,
    displayName: invite.display_name,
    password,
    role: "editor",
  });
  if (!created.ok) {
    // duplicate-email means an account was made in the meantime — send them to
    // sign in rather than looping on the invite.
    if (created.error === "duplicate-email") {
      await markInviteAccepted(token);
      return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
    }
    return NextResponse.redirect(new URL(`/join/${token}?error=weak`, request.url));
  }

  await markInviteAccepted(token);

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    createSessionCookie({ uid: created.id, role: "editor", name: invite.display_name }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    }
  );

  // Land on the welcome/guide so a brand-new editor knows what to do next.
  return NextResponse.redirect(new URL("/join/welcome", request.url));
}
