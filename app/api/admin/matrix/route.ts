import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/requireAdmin";
import { dismissMatrixPair, restoreMatrixPair } from "@/lib/queries/matrixMismatches";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// Setting a matrix divergence aside, or putting it back. Admin only: this is
// the compiler's judgement about his own data, not something an editor makes
// on his behalf.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.redirect(new URL("/admin?error=unauthorized", request.url));
  }

  const form = await request.formData();
  const key = String(form.get("key") ?? "");
  const action = String(form.get("action") ?? "");

  if (key) {
    if (action === "dismiss") {
      await dismissMatrixPair(
        key,
        {
          song: String(form.get("song") ?? ""),
          ownMatrix: String(form.get("ownMatrix") ?? ""),
          stubMatrix: String(form.get("stubMatrix") ?? ""),
        },
        session.name
      );
    } else if (action === "restore") {
      await restoreMatrixPair(key);
    }
    // The list is cached against the catalogue tag, so drop it to show the
    // change straight away rather than on the next upload.
    revalidateTag(CATALOGUE_TAG, { expire: 0 });
  }

  return NextResponse.redirect(
    new URL(action === "restore" ? "/admin/matrix?view=dismissed" : "/admin/matrix", request.url)
  );
}
