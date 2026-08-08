import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TrackDetailCard from "@/components/TrackDetailCard";
import EditorPanel from "@/components/EditorPanel";
import { getRecordById } from "@/lib/queries/records";
import { getSession } from "@/lib/auth/requireAdmin";
import { computeRecordKey, getRecordLog } from "@/lib/editor/overlay";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

// `back` comes from a URL query param, so it's untrusted input even though
// it only ever renders an in-page link, never a server redirect.
//
// Rejecting "//" by prefix is NOT sufficient: browsers normalise a backslash
// to a forward slash while parsing, so "/\evil.com" passes a naive
// startsWith("//") check and still resolves to https://evil.com — an
// off-site "Back to results" link, i.e. a phishing vector. Rather than play
// whack-a-mole with escape variants, resolve the value against a dummy
// origin and require that it actually stayed on that origin.
const DUMMY_ORIGIN = "https://rkr.invalid";

function safeBackHref(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  // Control characters (tab/newline) are stripped by URL parsers and can be
  // used to smuggle a scheme past the checks below.
  if (/[\u0000-\u0020\\]/.test(value)) return null;
  let resolved: URL;
  try {
    resolved = new URL(value, DUMMY_ORIGIN);
  } catch {
    return null;
  }
  if (resolved.origin !== DUMMY_ORIGIN) return null;
  return `${resolved.pathname}${resolved.search}`;
}

// Per-record title/description. Without this every one of the 135k detail
// pages inherited the site-wide title, so to a search engine they looked like
// 135k copies of the same page — which suppresses how many get indexed at all
// and means none of them match a search for the record itself. A title built
// from artist, title, label and year is exactly what someone hunting a
// specific pressing types in.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recordId = parseInt(id, 10);
  if (!Number.isFinite(recordId)) return {};
  const record = await getRecordById(recordId);
  if (!record) return {};

  const artist = record.artist?.trim();
  const title = record.title?.trim();
  const heading = [artist, title].filter(Boolean).join(" – ") || "Record";

  // Release parenthetical: "(Studio One, 1968)" — omitted entirely if neither
  // is known, rather than leaving empty brackets.
  const release = [record.label?.trim(), record.year?.trim()].filter(Boolean).join(", ");
  const pageTitle = release ? `${heading} (${release})` : heading;

  // The description reads as a sentence and carries the fields collectors
  // actually search by (label number, matrix number, producer, format).
  const facts: string[] = [];
  if (record.label_number?.trim()) facts.push(`label no. ${record.label_number.trim()}`);
  if (record.matrix_number?.trim()) facts.push(`matrix ${record.matrix_number.trim()}`);
  if (record.producer?.trim()) facts.push(`produced by ${record.producer.trim()}`);
  if (record.format?.trim()) facts.push(`${record.format.trim()}"`);
  if (record.country?.trim()) facts.push(record.country.trim());
  const bSide = record.b_side_title?.trim();

  const description =
    `${heading}${release ? ` — ${release}` : ""}. ` +
    (bSide ? `B-side: ${bSide}. ` : "") +
    (facts.length ? `${facts.join(", ")}. ` : "") +
    `Catalogue entry in the Roots Knotty Roots Jamaican singles discography.`;

  const canonical = `/records/${recordId}`;
  return {
    title: pageTitle,
    description,
    alternates: { canonical },
    openGraph: { title: pageTitle, description, url: canonical, type: "article" },
    twitter: { title: pageTitle, description },
  };
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
  const deleteError = first(sp.deleteError);

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
      {deleteError && (
        <div className="border-2 border-error text-error bg-paper px-4 py-2 font-body mb-4">
          {deleteError === "confirm"
            ? "Nothing was deleted — you need to tick the confirmation box first."
            : deleteError === "missing"
              ? "That record no longer exists, so there was nothing to delete."
              : "Something went wrong deleting that record. Please try again."}
        </div>
      )}

      {/* Editors reach the tools by scrolling past the whole detail card, which
          on a phone is a long way down and easy to miss entirely — so surface a
          jump link up here too. */}
      {isEditor && (
        <a
          href="#editor-tools"
          className="inline-block mb-3 px-3 py-1.5 border border-frame text-ink font-body text-sm tracking-wide hover:bg-parchment-deep transition-colors"
        >
          ✎ Edit this track
        </a>
      )}

      <TrackDetailCard record={record} />

      {isEditor && (
        <div id="editor-tools" className="mt-6 scroll-mt-4">
          <EditorPanel record={record} log={log} editorName={session.name} />
        </div>
      )}
    </div>
  );
}
