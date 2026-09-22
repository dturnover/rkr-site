import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import TrackDetailCard from "@/components/TrackDetailCard";
import EditorPanel from "@/components/EditorPanel";
import ReleaseTracks from "@/components/ReleaseTracks";
import { getRecordById } from "@/lib/queries/records";
import { getSession } from "@/lib/auth/requireAdmin";
import { computeRecordKey, getRecordLog } from "@/lib/editor/overlay";
import { deriveReleaseBase, findStubMismatches, getReleaseSiblings } from "@/lib/releaseGroup";
import { findBSideEntry } from "@/lib/queries/bSideEntry";
import { resolveRecordId } from "@/lib/recordRoute";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";
import { FLAG_RECORD_NUMBERS, isEnabled } from "@/lib/settings";

// Editing lives on its own route so the PUBLIC record page can be cached.
//
// A page that reads cookies, headers or search params cannot be served from a
// cache — Next has to run a function for every single request to decide what to
// show. The record page did all three (the session cookie, the crawl guard's
// headers, the ?back= parameter), which meant 135k pages each costing a
// serverless invocation on every view, human or bot. With traffic running at
// roughly 800 machine requests per real visitor, that was the bill.
//
// Everything request-shaped now lives here instead, on a route only five
// signed-in people ever open. The public page next door is static.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function EditRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/admin");

  const { id } = await params;
  const recordId = await resolveRecordId(id);
  if (recordId == null) notFound();

  const record = await getRecordById(recordId);
  if (!record) notFound();

  const sp = await searchParams;
  const saved = first(sp.saved);
  const createdState = first(sp.created);
  const created = createdState === "1" || createdState === "pair";
  const editError = first(sp.editError) === "1";
  const deleteError = first(sp.deleteError);

  const siblings = await getReleaseSiblings({
    id: record.id,
    label_number: record.label_number,
    b_side_label_number: record.b_side_label_number,
    label: record.label,
    format: record.format,
    year: record.year,
  });

  const catalogueNumber = (await isEnabled(FLAG_RECORD_NUMBERS))
    ? (record.catalogue_number ?? null)
    : null;

  // The B side's own entry, when it has one — shortens "I need to fix the year
  // on this flip side", which the six B-side columns have no field for.
  const bSideEntry = await findBSideEntry({
    id: record.id,
    b_side_artist: record.b_side_artist,
    b_side_title: record.b_side_title,
    label: record.label,
    country: record.country,
    format: record.format,
    year: record.year,
  });
  const log = await getRecordLog(computeRecordKey(record));
  // Where a paired entry's stub disagrees with this entry. Admin only: the
  // compiler judged this too fine-grained to put in front of editors, who would
  // read it as a fault on a record they didn't enter.
  const mismatches = session.role === "admin" ? findStubMismatches(record, siblings) : [];

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/records/${record.id}`}
        className="font-body text-sm text-ink-soft hover:text-rasta-red inline-block mb-3"
      >
        &laquo; Back to the entry
      </Link>

      {created && (
        <div className="border-2 border-rasta-green text-rasta-green bg-paper px-4 py-2 font-body mb-4">
          {createdState === "pair"
            ? "Both entries created — this side, and the B-side as its own entry with its own producer, riddim and genre."
            : "New track created."}
        </div>
      )}
      {saved != null && (
        <div className="border-2 border-rasta-green text-rasta-green bg-paper px-4 py-2 font-body mb-4">
          {Number(saved) > 0
            ? `Saved ${saved} change${Number(saved) === 1 ? "" : "s"}.`
            : "No changes to save."}
        </div>
      )}
      {editError && (
        <div className="border-2 border-error text-error bg-paper px-4 py-2 font-body mb-4">
          Something went wrong saving those changes. Please try again.
        </div>
      )}
      {deleteError && (
        <div className="border-2 border-error text-error bg-paper px-4 py-2 font-body mb-4">
          {deleteError === "confirm"
            ? "Nothing was deleted — you need to tick the confirmation box first."
            : deleteError === "missing"
              ? "That record no longer exists, so there was nothing to delete."
              : "Something went wrong deleting that record. Please try again."}
        </div>
      )}

      <TrackDetailCard record={record} catalogueNumber={catalogueNumber} />

      <ReleaseTracks
        record={record}
        siblings={siblings}
        base={deriveReleaseBase(record.label_number)}
      />

      <div id="editor-tools" className="mt-6 scroll-mt-4">
        <EditorPanel
          record={record}
          log={log}
          editorName={session.name}
          mismatches={mismatches}
          bSideEntry={bSideEntry}
        />
      </div>
    </div>
  );
}
