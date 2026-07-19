import Link from "next/link";
import { notFound } from "next/navigation";
import TrackDetailCard from "@/components/TrackDetailCard";
import EditorPanel from "@/components/EditorPanel";
import { getRecordById } from "@/lib/queries/records";
import { getSession } from "@/lib/auth/requireAdmin";
import { computeRecordKey, getRecordLog } from "@/lib/editor/overlay";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

// Only accept a same-origin relative path (must start with exactly one "/",
// never "//" which browsers treat as protocol-relative to another host) —
// `back` comes from a URL query param, so treat it as untrusted input even
// though it's only ever used to render an in-page link, never a redirect.
function safeBackHref(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (!Number.isFinite(recordId)) notFound();

  const record = await getRecordById(recordId);
  if (!record) notFound();

  const sp = await searchParams;
  const backHref = safeBackHref(first(sp.back));
  const saved = first(sp.saved);
  const created = first(sp.created) === "1";
  const editError = first(sp.editError) === "1";

  const session = await getSession();
  const isEditor = !!session;
  const log = isEditor ? await getRecordLog(computeRecordKey(record)) : [];

  return (
    <div className="max-w-2xl mx-auto">
      {backHref && (
        <Link
          href={backHref}
          className="font-body text-sm text-ink-soft hover:text-rasta-red inline-block mb-3"
        >
          &laquo; Back to results
        </Link>
      )}

      {created && (
        <div className="border-2 border-rasta-green text-rasta-green bg-paper px-4 py-2 font-body mb-4">
          New track created.
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

      <TrackDetailCard record={record} />

      {isEditor && (
        <div className="mt-6">
          <EditorPanel record={record} log={log} editorName={session.name} />
        </div>
      )}
    </div>
  );
}
