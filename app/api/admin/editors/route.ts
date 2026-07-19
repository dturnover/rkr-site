import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/requireAdmin";
import { createUser, setUserActive } from "@/lib/auth/users";

// Admin-only provisioning of editor accounts. Both actions re-check admin
// server-side; an editor session must never be able to create accounts or
// change access. Posts back to /admin with a status param so the page can
// show a banner (the admin UI is a plain form, no client JS required).
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "create") {
    const displayName = String(form.get("displayName") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const result = await createUser({ email, displayName, password, role: "editor" });
    if (!result.ok) {
      return NextResponse.redirect(new URL(`/admin?editorError=${result.error}`, request.url));
    }
    return NextResponse.redirect(new URL("/admin?editorCreated=1", request.url));
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
