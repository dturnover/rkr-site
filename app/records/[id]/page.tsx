import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import TrackDetailCard from "@/components/TrackDetailCard";
import ReleaseTracks from "@/components/ReleaseTracks";
import { getRecordById } from "@/lib/queries/records";
import { deriveReleaseBase, getReleaseSiblings } from "@/lib/releaseGroup";
import { canonicalRecordNumberSegment, resolveRecordId } from "@/lib/recordRoute";
import { FLAG_RECORD_NUMBERS, isEnabled } from "@/lib/settings";

// This page is CACHED, and everything about it is shaped by that.
//
// It is the most requested route in the site by two orders of magnitude, and
// almost all of that traffic is machines — measured at roughly 800 requests per
// real visitor: ~34k function invocations every six hours against 1.2k visitors
// a week. While this page read cookies (the session), headers (the crawl guard)
// or search params (?back=), Next had to run a function for every one of those
// requests and nothing could be served from a cache. That was the bill.
//
// So this route reads NONE of them. The session and the editor tools moved to
// ./edit. The crawl guard moved off this route entirely — rate limiting belongs
// at the firewall, which turns a request away before we pay to render it. The
// "Back to results" link is gone, because reading one search parameter costs
// the entire cache.
//
// force-static is the guard rather than the mechanism: it makes cookies(),
// headers() and search params return empty here, so if one of them is ever
// reintroduced this page keeps serving from cache instead of quietly going
// dynamic again and restoring the bill with nothing on screen to show for it.
export const dynamic = "force-static";

// Corrections must not wait this out, and they don't: every write path
// revalidates the record it touched, and an import revalidates the whole route.
// This window is only the backstop for anything that slips past that.
//
// A day, not an hour. After the window, the next visit regenerates the page —
// a function invocation plus database reads — and crawlers guarantee a next
// visit to every one of the 135k. At an hour, a record crawled continuously
// could be rebuilt 24 times a day for no change in content.
//
// Next serves the SHORTEST revalidate of this page and of every data cache its
// render touches (getRecordById, getRecordIdByNumber, the release siblings),
// so those are set to a day as well. Lower any one of them and this number
// stops being what ships — check Cache-Control on a real response.
export const revalidate = 86400;

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
  // The page itself redirects loose spellings; don't spend reads titling them.
  if (canonicalRecordNumberSegment(id)) return {};
  const recordId = await resolveRecordId(id);
  if (recordId == null) return {};
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

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // "rkr-123" and friends are a real record written loosely — send them to the
  // one spelling that's cached, rather than rendering and caching a duplicate.
  // No database read: the canonical form is computed from the text alone.
  const canonical = canonicalRecordNumberSegment(id);
  if (canonical) permanentRedirect(`/records/${canonical}`);
  const recordId = await resolveRecordId(id);
  // Null covers both an unreadable segment and a catalogue number whose record
  // is no longer in the catalogue — see getRecordIdByNumber for why an orphaned
  // number is a 404 rather than a best guess at what it used to mean.
  if (recordId == null) notFound();

  const record = await getRecordById(recordId);
  if (!record) notFound();

  // A 12" or EP is entered as two rows sharing a base label number, so the
  // other half of the record has to be found and shown alongside it. Format
  // and year are passed so a reused catalogue number can be told apart from a
  // genuine second side — see lib/releaseGroup.ts.
  const siblings = await getReleaseSiblings({
    id: record.id,
    label_number: record.label_number,
    b_side_label_number: record.b_side_label_number,
    label: record.label,
    format: record.format,
    year: record.year,
  });

  // The permanent catalogue number, if the feature is on and this record has
  // one. Anything missing simply hides the line rather than showing a
  // placeholder — a record imported before numbering shipped, or added since
  // the last import, has no number yet and shouldn't claim one.
  const catalogueNumber = (await isEnabled(FLAG_RECORD_NUMBERS))
    ? (record.catalogue_number ?? null)
    : null;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Editors arrive from a bookmark or from here; everyone else is one
          click from a sign-in page the footer already links publicly. nofollow
          so crawlers don't spend our redirects walking it. */}
      <Link
        href={`/records/${record.id}/edit`}
        rel="nofollow"
        className="font-body text-xs text-ink-soft hover:text-rasta-red inline-block mb-3"
      >
        &#9998; Edit this entry
      </Link>

      <TrackDetailCard record={record} catalogueNumber={catalogueNumber} />

      <ReleaseTracks
        record={record}
        siblings={siblings}
        base={deriveReleaseBase(record.label_number)}
      />
    </div>
  );
}
