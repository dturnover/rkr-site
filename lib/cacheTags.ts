import { revalidatePath, revalidateTag } from "next/cache";

// Single cache tag for everything derived from the catalogue (record lookups,
// search results, browse facets, the catalogue status). The read paths tag
// their cached results with this. Over-invalidating (flushing all catalogue
// caches on any single edit) is fine here — edits are infrequent relative to
// reads, and the reads are what we're protecting the database from under load.
export const CATALOGUE_TAG = "catalogue";

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
 */
export function revalidateCatalogue(recordId?: number | null): void {
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
  if (recordId != null && Number.isFinite(recordId)) {
    revalidatePath(`/records/${recordId}`);
  } else {
    revalidatePath("/records/[id]", "page");
  }
}
