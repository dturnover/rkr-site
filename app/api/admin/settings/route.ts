import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { FLAGS, setFlag } from "@/lib/settings";

// Turns a feature on or off site-wide, with no deploy. Deliberately the
// simplest possible route: one form, one field, admin-only. If a feature is
// misbehaving this is the thing that has to work, so there is nothing in here
// that can fail in an interesting way.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const key = String(form.get("key") ?? "");
  const on = String(form.get("on") ?? "") === "1";

  if (!FLAGS[key]) return NextResponse.redirect(new URL("/admin", request.url));

  await setFlag(key, on, session.name);
  return NextResponse.redirect(
    new URL(`/admin?flag=${encodeURIComponent(key)}&state=${on ? "on" : "off"}`, request.url)
  );
}
