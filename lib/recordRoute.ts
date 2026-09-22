import { getRecordIdByNumber, parseRecordNumber } from "@/lib/recordNumbers";
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
  const rowId = parseInt(segment, 10);
  return Number.isFinite(rowId) ? rowId : null;
}
