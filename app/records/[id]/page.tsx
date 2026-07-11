import Link from "next/link";
import { notFound } from "next/navigation";
import TrackDetailCard from "@/components/TrackDetailCard";
import { getRecordById } from "@/lib/queries/records";
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
      <TrackDetailCard record={record} />
    </div>
  );
}
