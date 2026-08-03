// Single cache tag for everything derived from the catalogue (record lookups,
// search results, browse facets, the catalogue status). The read paths tag
// their cached results with this; the write paths (editor save/create, admin
// import/restore) call revalidateTag(CATALOGUE_TAG, { expire: 0 }) so a change
// is reflected immediately. Over-invalidating (flushing all catalogue caches on
// any single edit) is fine here — edits are infrequent relative to reads, and
// the reads are what we're protecting the database from under load.
export const CATALOGUE_TAG = "catalogue";
