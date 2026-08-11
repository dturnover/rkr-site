import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSessionCookie,
  checkAdminPassword,
} from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/auth/users";
import { isLockedOut, recordFailure, recordSuccess, loginKeys } from "@/lib/auth/loginRateLimit";
import { isBodyTooLarge, LOGIN_BODY_MAX_BYTES } from "@/lib/http/bodySizeGuard";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  if (isBodyTooLarge(request, LOGIN_BODY_MAX_BYTES)) {
    return NextResponse.redirect(new URL("/admin?error=invalid-password", request.url));
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Throttle by source address AND by the account being targeted, so a
  // distributed guess against one account is caught too.
  const keys = loginKeys(clientIp(request), email);
  if (await isLockedOut(keys)) {
    return NextResponse.redirect(new URL("/admin?error=too-many-attempts", request.url));
  }

  // A provisioned account (admin or editor) is tried first, so a real editor
  // row is always used when the email matches one. The bootstrap ADMIN_PASSWORD
  // is only a fallback — it grants admin regardless of the typed email (that
  // password IS the admin secret), guaranteeing dad can log in even with an
  // empty/unreachable users table.
  let session: { uid: number | "env-admin"; role: "admin" | "editor"; name: string; ep?: number } | null = null;

  if (email) {
    const user = await verifyCredentials(email, password).catch(() => null);
    if (user) {
      session = { uid: user.id, role: user.role, name: user.display_name, ep: user.session_epoch };
    }
  }
  if (!session && checkAdminPassword(password)) {
    // The bootstrap admin has no users row to carry a display name, so without
    // ADMIN_DISPLAY_NAME every change it makes is attributed to whatever was
    // typed into the email box — which is how the modification log ends up
    // crediting an email address instead of a person.
    session = {
      uid: "env-admin",
      role: "admin",
      name: process.env.ADMIN_DISPLAY_NAME?.trim() || email || "Admin",
    };
  }

  if (!session) {
    await recordFailure(keys);
    return NextResponse.redirect(new URL("/admin?error=invalid-password", request.url));
  }
  await recordSuccess(keys);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionCookie(session), SESSION_COOKIE_OPTIONS);

  return NextResponse.redirect(new URL("/admin", request.url));
}
