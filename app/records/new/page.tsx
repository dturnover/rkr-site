import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import EditorRecordForm from "@/components/EditorRecordForm";
import { getSession } from "@/lib/auth/requireAdmin";
import { getRecordById } from "@/lib/queries/records";
import { flipSideValues } from "@/lib/editor/flipSide";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

// Editor-only page — keep it out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function NewRecordPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");

  const sp = await searchParams;
  const createError = first(sp.createError);

  // "?flip=<id>" starts this entry from another record's B side: that song
  // becomes the A side here, the two sides swap, and the facts belonging to
  // the physical record are carried over. See lib/editor/flipSide.ts.
  const flipId = parseInt(first(sp.flip) ?? "", 10);
  const source = Number.isFinite(flipId) ? await getRecordById(flipId) : null;
  const values = source ? flipSideValues(source) : {};

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-3xl text-ink mb-1">Add a New Track</h1>
      <p className="font-body text-ink-soft mb-6">
        Fill in what you know. Only the fields you enter are saved. This track
        is attributed to you and preserved across the admin&rsquo;s catalogue
        updates.
      </p>

      {createError === "empty" && (
        <div className="border-2 border-error text-error bg-paper px-4 py-2 font-body mb-4">
          Enter at least an artist or a title.
        </div>
      )}
      {createError === "1" && (
        <div className="border-2 border-error text-error bg-paper px-4 py-2 font-body mb-4">
          Something went wrong creating that track. Please try again.
        </div>
      )}

      {source && (
        <div className="border-2 border-rasta-gold bg-paper px-4 py-3 font-body text-sm mb-4">
          <strong className="text-ink">Entering the flip side of{" "}
            {source.label_number || `record ${source.id}`}.</strong>{" "}
          <span className="text-ink-soft">
            The two sides have been swapped over and the label, country, year, format and producer
            copied across. Fill in this song&rsquo;s own riddim, genre and notes &mdash; those are
            the reason it gets its own entry. Check every field before saving.{" "}
            <Link href={`/records/${source.id}`} className="text-link underline hover:text-rasta-red">
              Back to the original entry
            </Link>
            .
          </span>
        </div>
      )}

      <div className="frame-double bg-paper p-5 sm:p-7">
        <EditorRecordForm action="/api/editor/create" values={values} submitLabel="Create Track" />
      </div>
    </div>
  );
}
