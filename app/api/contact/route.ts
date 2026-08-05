import { NextRequest, NextResponse } from "next/server";
import { submitContact } from "@/lib/contact";
import { allowRequest } from "@/lib/rateLimit";
import { isBodyTooLarge } from "@/lib/http/bodySizeGuard";

// Public endpoint — the only unauthenticated write in the app, so it carries
// its own abuse controls: a size guard, a per-IP rate limit, and a honeypot
// field that real users never see but scripted spam fills in.
export const maxDuration = 30;

const CONTACT_BODY_MAX_BYTES = 32 * 1024;
const CONTACT_RATE_LIMIT = 5; // submissions
const CONTACT_RATE_WINDOW_MS = 10 * 60_000; // per 10 minutes

export async function POST(request: NextRequest) {
  if (isBodyTooLarge(request, CONTACT_BODY_MAX_BYTES)) {
    return NextResponse.redirect(new URL("/contact?sent=invalid", request.url));
  }

  const form = await request.formData();

  // Honeypot: hidden via CSS and left blank by humans. Silently pretend success
  // so a bot gets no signal that it was rejected.
  if (String(form.get("website") ?? "").trim() !== "") {
    return NextResponse.redirect(new URL("/contact?sent=1", request.url));
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await allowRequest(`contact:${ip}`, CONTACT_RATE_LIMIT, CONTACT_RATE_WINDOW_MS))) {
    return NextResponse.redirect(new URL("/contact?sent=throttled", request.url));
  }

  const result = await submitContact({
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    message: String(form.get("message") ?? ""),
  });

  if (!result.ok) {
    return NextResponse.redirect(new URL("/contact?sent=invalid", request.url));
  }
  return NextResponse.redirect(new URL("/contact?sent=1", request.url));
}
