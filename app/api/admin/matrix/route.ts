import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/requireAdmin";
import { revalidateTag } from "next/cache";
import { dismissMatrixPair, restoreMatrixPair, MATRIX_TAG } from "@/lib/queries/matrixMismatches";

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

  // Re-run the check. The join is held for a day so that refreshing this page
  // cannot keep firing the heaviest query in the application — but that means a
  // pair the compiler has just CORRECTED stays on the list until the answer is
  // recomputed, which reads as the correction not having worked. He reported
  // exactly that. This is the deliberate way to ask for a fresh answer.
  if (action === "rerun") {
    revalidateTag(MATRIX_TAG, { expire: 0 });
    return NextResponse.redirect(new URL("/admin/matrix?run=1", request.url));
  }

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
    // Nothing to invalidate. The worklist applies dismissals outside its cache
    // (see findMatrixMismatches), so this takes effect on the next render. It
    // used to call revalidateTag(CATALOGUE_TAG) here, which stopped meaning
    // anything once the report was untagged — and would have been wrong anyway,
    // since setting a pair aside changes no catalogue data.
  }

  // Back to the list itself, still running. Without run=1 the page returns to
  // its "Run the check" prompt showing nothing, which reads as though every
  // mismatch vanished — the other half of what the compiler reported.
  return NextResponse.redirect(
    new URL(
      action === "restore" ? "/admin/matrix?view=dismissed" : "/admin/matrix?run=1",
      request.url
    )
  );
}
