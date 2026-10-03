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

/** The browse indexes and per-value totals (lib/queries/browse.ts) — the list
 * of every country, year, format and genre with its count, and each letter of
 * the artist/label/producer/riddim/origin lists. Each is a GROUP BY or COUNT
 * over a large slice of the catalogue, up to all 135k rows.
 *
 * Kept off CATALOGUE_TAG because almost no correction can change them. They
 * depend only on the browse-category fields (FACET_FIELDS below); fixing a
 * matrix number, a title, a note or a credit leaves every one of them exactly
 * as it was. While they shared the catalogue tag, every save of any field
 * threw all of them away, and the next crawler through /browse rebuilt them
 * all. Now a save flushes them only when a category field actually changed. */
export const FACET_TAG = "catalogue-facets";

/** The fields the browse indexes are built from — one per facet in
 * lib/facetConfig.ts (each facet's displayColumn; its *_norm column is derived
 * from the same field). A save that changes none of these cannot change a
 * browse index. Keep in step with FACETS if a facet is ever added. */
export const FACET_FIELDS: ReadonlySet<string> = new Set([
  "artist",
  "country",
  "year",
  "format",
  "label",
  "producer",
  "riddim",
  "genre",
  "song_origin",
]);

/** What the cached RECORD PAGES are built from — and deliberately nothing else.
 *
 * Next ties a cached page to every data-cache tag its render touched, so
 * revalidating a tag also throws away every page that read data under it. The
 * record pages used to read their data under CATALOGUE_TAG, and every save
 * revalidates CATALOGUE_TAG — so saving ONE record invalidated ALL 135,543
 * record pages (verified: saving a matrix number on record 1 turned records 5,
 * 7 and 200 from cache hits into misses). On any day of editing, every crawler
 * visit after every save rebuilt a page from scratch, which defeated the
 * caching these pages exist for.
 *
 * So the record pages read only data tagged with:
 *   RECORD_PAGES_TAG  — the whole set, flushed only by whole-catalogue writes
 *                       (import, restore, number assignment);
 *   recordTag(id)     — that one record's row;
 *   releaseTag(key)   — the multi-sided release it belongs to, whose other
 *                       sides are listed on its page.
 * A save flushes its own record and its release, and the other 135k pages are
 * left alone. Never put CATALOGUE_TAG on anything a record page reads. */
export const RECORD_PAGES_TAG = "catalogue-record-pages";

export function recordTag(id: number): string {
  return `record:${id}`;
}

/** `key` is the normalised release base (see releaseKeyOf in lib/releaseGroup.ts). */
export function releaseTag(key: string): string {
  return `release:${key}`;
}

/** The typo-suggestion list on /admin/typos. Dismissing a suggestion changes
 * only this list, so it flushes only this tag — it used to flush the entire
 * catalogue, every record page included. */
export const TYPOS_TAG = "typo-suggestions";

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
 * (create, delete). `facetsChanged` is for a save that changed a browse
 * category field (see touchesFacets). A plain correction leaves both off,
 * which is what spares the catalogue recount and the browse-index rebuilds;
 * see CATALOGUE_SIZE_TAG and FACET_TAG. A bulk write always flushes
 * everything, since an import can change anything.
 */
export async function revalidateCatalogue(
  recordId?: number | null,
  opts: RevalidateOptions = {}
): Promise<void> {
  const singleRecord = recordId != null && Number.isFinite(recordId);
  await revalidateRecords(singleRecord ? [recordId!] : null, opts);
}

interface RevalidateOptions {
  countChanged?: boolean;
  facetsChanged?: boolean;
  /** Catalogue numbers of records that no longer exist after this write (a
   * delete), looked up BEFORE the write. Once the row is gone its number can't
   * be found by id any more, but its RKR-numbered page is still cached. */
  knownNumbers?: number[];
  /** Label numbers these records had BEFORE the write, when it changed them or
   * removed the record. The release a record USED to belong to lists it on its
   * other sides' pages, and only the old label number says which release that
   * was. The current label numbers are looked up here; these are the extras. */
  previousLabelNumbers?: (string | null)[];
}

/** Above this many records, dropping the pages one by one stops being worth it
 * and the whole route is dropped instead. Both are lazy — nothing re-renders
 * until it's next visited — so the only question is how many pages a crawler
 * will find stale afterwards. */
const PER_PAGE_REVALIDATE_LIMIT = 500;

/** The general form: flush after a write that touched a known set of records
 * (`ids`), or the whole catalogue (`null`, after an import or restore).
 *
 * What gets dropped, and why each is conditional:
 *  - CATALOGUE_TAG (record data, search results, browse result lists) — always.
 *  - CATALOGUE_SIZE_TAG + the home page — only if the row count can have
 *    moved: a create, a delete, or a whole-catalogue write.
 *  - FACET_TAG (the browse indexes) — only if a browse-category field changed,
 *    or the count moved (a new or removed record changes the counts too).
 *  - Record pages — only the ones written to, unless there are too many to be
 *    worth listing; a whole-catalogue write drops them all. */
export async function revalidateRecords(
  ids: number[] | null,
  opts: RevalidateOptions = {}
): Promise<void> {
  const whole = ids === null;
  // Search results, browse result lists, typo suggestions. None of these feed a
  // cached page, so flushing this costs one recompute each on next use — see
  // RECORD_PAGES_TAG for why the record pages must not be on it.
  revalidateTag(CATALOGUE_TAG, { expire: 0 });
  if (whole) revalidateTag(RECORD_PAGES_TAG, { expire: 0 });
  if (whole || opts.countChanged) {
    revalidateTag(CATALOGUE_SIZE_TAG, { expire: 0 });
    // The home page is a cached page that prints the track count and the
    // last-import date. Dropping the data above isn't enough on its own — the
    // rendered HTML is a separate cache — so drop the page too.
    revalidatePath("/");
  }
  if (whole || opts.countChanged || opts.facetsChanged) {
    revalidateTag(FACET_TAG, { expire: 0 });
  }
  if (!whole && ids.length <= PER_PAGE_REVALIDATE_LIMIT) {
    const live = ids.filter((id) => Number.isFinite(id));
    for (const id of live) revalidateTag(recordTag(id), { expire: 0 });
    // The other sides of the same release show this record in their track
    // listing, so their pages are stale too — and only theirs.
    for (const key of await releaseKeysFor(live, opts.previousLabelNumbers)) {
      revalidateTag(releaseTag(key), { expire: 0 });
    }
    // The tags above already invalidate every page that read this record's
    // data, under either of its addresses. The explicit paths are belt and
    // braces, so a page is never left stale by a change in how Next ties tags
    // to pages.
    for (const id of live) revalidatePath(`/records/${id}`);
    // A record is cached under TWO addresses: /records/123 and its catalogue
    // number, /records/RKR-000123 — separate pages to the cache. Dropping only
    // the first left the second serving the old version, and the second is
    // the one the modification log links to: the compiler would correct a
    // record, click through from the log to check it, and see it unchanged.
    const { numbers, format } = await catalogueNumbersFor(ids, opts.knownNumbers);
    for (const n of numbers) revalidatePath(`/records/${format(n)}`);
  } else {
    // Too many to list (or a whole-catalogue write): drop the set.
    revalidateTag(RECORD_PAGES_TAG, { expire: 0 });
    // The route pattern covers both spellings of every record.
    revalidatePath("/records/[id]", "page");
  }
}

/** Release keys for these records as they are now, plus any they had before.
 * Imported lazily for the same cycle reason as catalogueNumbersFor. */
async function releaseKeysFor(
  ids: number[],
  previous: (string | null)[] = []
): Promise<string[]> {
  const { releaseKeyOf } = await import("@/lib/releaseGroup");
  const keys = new Set<string>();
  for (const ln of previous) {
    const k = releaseKeyOf(ln);
    if (k) keys.add(k);
  }
  if (ids.length > 0) {
    try {
      const { getClient } = await import("@/lib/db/client");
      const client = await getClient();
      const res = await client.execute({
        sql: `SELECT label_number FROM records WHERE id IN (${ids.map(() => "?").join(", ")})`,
        args: ids,
      });
      for (const r of res.rows) {
        const k = releaseKeyOf((r as unknown as { label_number: string | null }).label_number);
        if (k) keys.add(k);
      }
    } catch {
      // Worst case the release-mates keep their old listing until the daily
      // backstop. Never let cache housekeeping fail the write it follows.
    }
  }
  return [...keys];
}

// Imported lazily: lib/recordNumbers imports CATALOGUE_TAG from this module at
// load time, so a static import here would be a cycle.
async function catalogueNumbersFor(
  ids: number[],
  known: number[] = []
): Promise<{ numbers: number[]; format: (n: number) => string }> {
  const { getNumbersForRecordIds, formatRecordNumber } = await import("@/lib/recordNumbers");
  const found = await getNumbersForRecordIds(ids);
  return { numbers: [...new Set([...found.values(), ...known])], format: formatRecordNumber };
}

/** Whether any of these changed fields feeds a browse index. */
export function touchesFacets(fields: Iterable<string>): boolean {
  for (const f of fields) if (FACET_FIELDS.has(f)) return true;
  return false;
}
