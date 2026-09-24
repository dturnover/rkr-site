"use client";

import { useSearchParams } from "next/navigation";

/** "Record deleted." — shown on the home page after an editor deletes a record,
 * since the record's own page no longer exists to land on.
 *
 * Read in the browser rather than on the server so the home page can be one
 * cached page for everyone. Reading `?deleted=1` server-side is what made the
 * home page render on every single visit (force-dynamic), purely to show this
 * banner to the handful of editors who ever see it. Must stay inside a
 * <Suspense> boundary: without one, useSearchParams() bails the whole page out
 * of static rendering. */
export default function DeletedNotice() {
  if (useSearchParams().get("deleted") !== "1") return null;
  return (
    <div className="border-2 border-rasta-green text-rasta-green bg-paper px-4 py-2 font-body">
      Record deleted. It won&rsquo;t come back on the next spreadsheet upload.
    </div>
  );
}
