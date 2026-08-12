import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { clearCrawlBlock } from "@/lib/crawlGuard";

// Lifts a rate block. Admin-only, and the only action here — blocks are set
// automatically and expire automatically, so the one thing worth doing by
// hand is releasing someone the guard shouldn't have caught.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const ip = String(form.get("ip") ?? "").trim();
  if (ip) await clearCrawlBlock(ip);

  return NextResponse.redirect(new URL(`/admin/traffic?cleared=${ip ? "1" : "0"}`, request.url));
}
