import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionCookie,
  checkAdminPassword,
} from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/auth/users";
import { isLockedOut, recordFailure, recordSuccess } from "@/lib/auth/rateLimiter";
import { isBodyTooLarge, LOGIN_BODY_MAX_BYTES } from "@/lib/http/bodySizeGuard";

function clientKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  if (isBodyTooLarge(request, LOGIN_BODY_MAX_BYTES)) {
    return NextResponse.redirect(new URL("/admin?error=invalid-password", request.url));
  }

  const key = clientKey(request);
  if (isLockedOut(key)) {
    return NextResponse.redirect(new URL("/admin?error=too-many-attempts", request.url));
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // A provisioned account (admin or editor) is tried first, so a real editor
  // row is always used when the email matches one. The bootstrap ADMIN_PASSWORD
  // is only a fallback — it grants admin regardless of the typed email (that
  // password IS the admin secret), guaranteeing dad can log in even with an
  // empty/unreachable users table.
  let session: { uid: number | "env-admin"; role: "admin" | "editor"; name: string } | null = null;

  if (email) {
    const user = await verifyCredentials(email, password).catch(() => null);
    if (user) {
      session = { uid: user.id, role: user.role, name: user.display_name };
    }
  }
  if (!session && checkAdminPassword(password)) {
    session = { uid: "env-admin", role: "admin", name: email || "Admin" };
  }

  if (!session) {
    recordFailure(key);
    return NextResponse.redirect(new URL("/admin?error=invalid-password", request.url));
  }
  recordSuccess(key);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createSessionCookie(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
