import { revalidatePath, revalidateTag } from "next/cache";

// Single cache tag for everything derived from the catalogue (record lookups,
// search results, browse facets, the catalogue status). The read paths tag
// their cached results with this. Over-invalidating (flushing all catalogue
// caches on any single edit) is fine here — edits are infrequent relative to
// reads, and the reads are what we're protecting the database from under load.
export const CATALOGUE_TAG = "catalogue";

/** The catalogue's SIZE and import state — the row count, when it was last
 * imported, whether a previous version exists to restore (getDatabaseStatus).
 *
 * Kept apart from CATALOGUE_TAG because none of it can change when someone
 * corrects a field, and recomputing it is a COUNT(*) over all 135k rows. While
 * it shared the catalogue tag, every single editor save threw it away and the
 * next home-page visit paid for a full recount — on a site where a curator
 * makes hundreds of corrections and bots guarantee there is always a next
 * visit. Only a create, a delete, or a bulk change (import, restore, revert)
 * can move these numbers, so only those flush it. */
export const CATALOGUE_SIZE_TAG = "catalogue-size";

/** Flush the catalogue caches after a write.
 *
 * TWO caches, not one, and this is the part that is easy to get wrong.
 * revalidateTag clears cached DATA; revalidatePath clears cached PAGES. They
 * are separate, and since app/records/[id] became a cached page (see the note
 * at the top of that file) the tag alone would leave a corrected record
 * serving its old HTML until the revalidate window expired — the compiler
 * would fix something, refresh, and see no change.
 *
 * Pass the record's id when a write touched exactly one record, which is the
 * common case: only that page is dropped. Omit it after an import or a restore,
 * where the whole catalogue moved and every record page has to go.
 *
 * Both are lazy by design — Next marks the entries and re-renders on the next
 * visit — so clearing the whole route does not set 135k renders going at once.
 *
 * `countChanged` is for a single-record write that adds or removes a row
 * (create, delete). A plain field save leaves it off, which is what spares the
 * catalogue-size recount; see CATALOGUE_SIZE_TAG. A bulk write always flushes
 * it, since an import can change anything.
 */
export function revalidateCatalogue(
  recordId?: number | null,
  opts: { countChanged?: boolean } = {}
): void {
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
  const singleRecord = recordId != null && Number.isFinite(recordId);
  if (!singleRecord || opts.countChanged) {
    revalidateTag(CATALOGUE_SIZE_TAG, { expire: 0 });
    // The home page is a cached page that prints the track count and the
    // last-import date. Dropping the data above isn't enough on its own — the
    // rendered HTML is a separate cache — so drop the page too.
    revalidatePath("/");
  }
  if (singleRecord) {
    revalidatePath(`/records/${recordId}`);
  } else {
    revalidatePath("/records/[id]", "page");
  }
}
