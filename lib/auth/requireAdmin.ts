import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, readSessionCookie, type SessionPayload } from "./session";
import { getActiveUserById } from "./users";

// Validating the signed cookie alone is NOT enough: the payload is fixed at
// login and valid for 7 days, so disabling or deleting an editor left their
// existing session working the whole time (confirmed by observation — a
// deleted test account stayed signed in). Every authenticated request now
// re-checks the account against the database, so revocation is immediate and
// the role comes from the current row rather than whatever the cookie says.
//
// Wrapped in React's cache() so the extra lookup happens at most once per
// request even though the layout and the page both ask for the session. Only
// signed-in editors/admins ever reach it; anonymous visitors cost nothing.
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const session = readSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  // The bootstrap admin has no database row on purpose — its authority is the
  // ADMIN_PASSWORD env var, so dad can't be locked out by a bad users table.
  if (session.uid === "env-admin") return session;

  const user = await getActiveUserById(session.uid).catch(() => null);
  if (!user) return null;

  return { uid: user.id, role: user.role, name: user.display_name, exp: session.exp };
});

/** Admin-only gate (uploads, editor provisioning, restore). */
export async function isAdmin(): Promise<boolean> {
  return (await getSession())?.role === "admin";
}

/** Editor gate — admins are also editors, so admin passes here too. */
export async function isEditor(): Promise<boolean> {
  const role = (await getSession())?.role;
  return role === "admin" || role === "editor";
}

/** Back-compat alias for the pre-multi-user admin routes. */
export const isAdminAuthenticated = isAdmin;
