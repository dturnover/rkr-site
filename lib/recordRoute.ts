import { formatRecordNumber, getRecordIdByNumber, parseRecordNumber } from "@/lib/recordNumbers";
import { FLAG_RECORD_NUMBERS, isEnabled } from "@/lib/settings";

// A record is reachable by two different names in this one URL segment:
//
//   /records/48213         the row id — what every internal link, the sitemap
//                          and every already-indexed URL uses
//   /records/RKR-000123    the permanent catalogue number (lib/recordNumbers.ts)
//
// The two namespaces overlap as bare integers, which is exactly why the
// catalogue number is only ever recognised in its prefixed form. A plain "123"
// is always a row id and is never quietly reinterpreted as catalogue number
// 123 — those are two different records, and guessing between them would hand
// a reader the wrong one.
//
// The row id stays canonical (see generateMetadata): the 135k already-indexed
// URLs are built on it, and pointing search engines at a second address for
// every page is not a change to make as a side effect of adding a number.
export async function resolveRecordId(segment: string): Promise<number | null> {
  const catalogueNumber = parseRecordNumber(segment);
  if (catalogueNumber != null) {
    // Gated with the display: if the compiler switches catalogue numbers off,
    // the addresses they created stop resolving too, rather than lingering as
    // the one part of a disabled feature still answering.
    if (!(await isEnabled(FLAG_RECORD_NUMBERS))) return null;
    return await getRecordIdByNumber(catalogueNumber);
  }
  // Only the exact form the site itself links to. parseInt read "0123",
  // "123abc" and "123.9" all as record 123 — and since the record page is
  // cached per URL, each of those spellings was its own cache entry: a fresh
  // render and fresh database reads for a page already cached under /records/123.
  // Anything generating URLs could walk that forever for free. Nothing on the
  // site links to those forms, so they are simply not records.
  if (!/^[1-9]\d{0,9}$/.test(segment)) return null;
  const rowId = Number(segment);
  return Number.isSafeInteger(rowId) ? rowId : null;
}

/** The one spelling of a catalogue-number URL: "RKR-000123".
 *
 * parseRecordNumber is deliberately forgiving — it reads what people type
 * ("rkr 123", "RKR000123") — which is right for a search box and wrong for a
 * cached URL, where every spelling is a separate cache entry. Returns the
 * canonical segment when `segment` is a catalogue number written some other
 * way, so the page can redirect there; null when it is already canonical or
 * isn't a catalogue number at all. Bounded in length so a segment padded with
 * a thousand zeros doesn't count as a spelling worth redirecting. */
export function canonicalRecordNumberSegment(segment: string): string | null {
  if (segment.length > 24) return null;
  const n = parseRecordNumber(segment);
  if (n == null) return null;
  const canonical = formatRecordNumber(n);
  return canonical === segment ? null : canonical;
}
