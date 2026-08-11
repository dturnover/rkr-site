import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { setLogNote, setLogReviewed } from "@/lib/editor/overlay";

// The compiler's review pass over the modification log: ticking entries off as
// checked, and leaving a note for the editor who made the change. Both are the
// compiler's own workflow, so they're admin-only — editors read the notes on
// the record page but don't write them.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const logId = parseInt(String(form.get("logId") ?? ""), 10);
  const action = String(form.get("action") ?? "");

  // Where to send them back to — the log page they were on, with its filter
  // and page intact, so ticking an entry doesn't lose their place.
  const back = String(form.get("back") ?? "/mod-log");
  const backUrl = back.startsWith("/mod-log") ? back : "/mod-log";

  if (!Number.isFinite(logId)) {
    return NextResponse.redirect(new URL(backUrl, request.url));
  }

  if (action === "review") {
    await setLogReviewed(logId, String(form.get("reviewed") ?? "") === "1", session.name);
  } else if (action === "note") {
    await setLogNote(logId, String(form.get("note") ?? ""), session.name);
  }

  return NextResponse.redirect(new URL(backUrl, request.url));
}
