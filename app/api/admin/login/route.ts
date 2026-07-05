import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  checkPassword,
  createAdminCookieValue,
} from "@/lib/auth/adminCookie";
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
  const password = String(formData.get("password") ?? "");

  if (!checkPassword(password)) {
    recordFailure(key);
    return NextResponse.redirect(new URL("/admin?error=invalid-password", request.url));
  }
  recordSuccess(key);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, createAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
