import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/requireAdmin";
import { deleteContactMessage } from "@/lib/contact";

// Admin-only deletion of stored contact messages.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }
  const form = await request.formData();
  const id = parseInt(String(form.get("id") ?? ""), 10);
  if (Number.isFinite(id)) await deleteContactMessage(id);
  return NextResponse.redirect(new URL("/admin/messages", request.url));
}
