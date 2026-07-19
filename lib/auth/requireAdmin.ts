import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, readSessionCookie, type SessionPayload } from "./session";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return readSessionCookie(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

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
