import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// Permanent catalogue numbers — the "RKR-000123" a collector can quote in an
// email and still have point at the same record a year later.
//
// WHY THIS EXISTS AT ALL, given `records` already has an `id`:
// the row id is not a stable name for a record. An unchanged record keeps its
// id across an import (the diff importer's hash hit is a no-op), but a CHANGED
// one does not: lib/import/diffImport.ts applies an edit as delete-old +
// insert-new, so the corrected record comes back with a fresh id past the
// current maximum. That means the id moves *precisely when someone corrects
// the record* — which is exactly the moment a reader is most likely to be
// quoting it ("RKR-000123 has the wrong year"). A number that is stable 99.7%
// of the time but breaks on the 0.3% you actually cite is worse than no number
// at all, so the id is not what gets shown.
//
// So the number is assigned once per RECORD, not per row, and stored here.
//
// This table lives OUTSIDE the import swap set (records / records_new /
// records_previous), for the same reason the editor overlay does: every upload
// rebuilds or rewrites the catalogue, and anything kept inside that set would
// be discarded along with it. Nothing in lib/import/atomicSwap.ts touches this
// table, which is the point.
//
// Keyed by `record_key` (lib/editor/overlay.ts computeRecordKey: matrix number,
// else label no + artist + title) because that is the only identity the
// catalogue carries that survives a rebuild.

const TABLE = "record_numbers";

/** Display width. The previous RKR site used six digits (RKR-710883) and the
 * catalogue is ~135k records, so six leaves plenty of room and every number
 * lines up in a column. Parsing accepts either form — see parseRecordNumber. */
const DIGITS = 6;

let ensured: Promise<void> | null = null;

export function ensureRecordNumbersTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      // `number` is UNIQUE (which is itself an index, so the reverse lookup
      // number → key is indexed without declaring a second one). Numbers are
      // never reused: nothing here ever DELETEs, so a record that leaves the
      // catalogue takes its number out of circulation with it rather than
      // handing it to some unrelated record later.
      await client.execute(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
          record_key  TEXT PRIMARY KEY,
          number      INTEGER NOT NULL UNIQUE,
          assigned_at TEXT NOT NULL
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

/** "RKR-000123". */
export function formatRecordNumber(n: number): string {
  return `RKR-${String(n).padStart(DIGITS, "0")}`;
}

/** Reads a catalogue number out of a URL segment or a typed search box.
 * Accepts "RKR-000123", "rkr-123" and a bare "RKR000123"; returns null for
 * anything else — notably for a plain "123", which is a row id and must NOT be
 * silently treated as a catalogue number (the two namespaces overlap and would
 * resolve to different records). */
export function parseRecordNumber(value: string): number | null {
  const m = /^\s*rkr[-\s]?0*(\d{1,9})\s*$/i.exec(value);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Assigns a number to every record in the live catalogue that doesn't have
 * one yet, and returns how many it handed out. Idempotent: running it twice in
 * a row assigns nothing the second time, so it is safe to call at the end of
 * every import and safe for an admin to press twice.
 *
 * Numbers are handed out in the catalogue's own row order (MIN(id) per key),
 * so on the first run they track the order of the compiler's spreadsheet
 * rather than looking randomly shuffled. After that, new records simply take
 * the next numbers up. */
export async function assignMissingRecordNumbers(): Promise<number> {
  await ensureRecordNumbersTable();
  const client = await getClient();

  // Read the high-water mark in JS and bind it, rather than writing
  // `(SELECT MAX(number) FROM record_numbers)` inside the INSERT's SELECT.
  // That subquery reads the very table being written, and whether SQLite
  // evaluates it once or re-evaluates it as rows land is not something to
  // depend on — getting it wrong would silently collide numbers.
  const maxRes = await client.execute(`SELECT COALESCE(MAX(number), 0) AS m FROM ${TABLE}`);
  const base = Number(maxRes.rows[0]?.m ?? 0);

  const res = await client.execute({
    sql: `
      INSERT INTO ${TABLE} (record_key, number, assigned_at)
      SELECT k.record_key, ? + ROW_NUMBER() OVER (ORDER BY k.first_id), ?
        FROM (
          SELECT record_key, MIN(id) AS first_id
            FROM records
           WHERE record_key IS NOT NULL AND record_key <> ''
             AND record_key NOT IN (SELECT record_key FROM ${TABLE})
           GROUP BY record_key
        ) AS k
    `,
    args: [base, new Date().toISOString()],
  });
  return Number(res.rowsAffected ?? 0);
}

/** How many records have a number and how many are still waiting — for the
 * admin page, so the compiler can see the feature is actually populated
 * rather than having to take it on trust. */
export async function getRecordNumberStats(): Promise<{ assigned: number; missing: number }> {
  await ensureRecordNumbersTable();
  const client = await getClient();
  const assigned = Number(
    (await client.execute(`SELECT COUNT(*) AS c FROM ${TABLE}`)).rows[0]?.c ?? 0
  );
  const missing = Number(
    (
      await client.execute(
        `SELECT COUNT(*) AS c FROM (
           SELECT record_key FROM records
            WHERE record_key IS NOT NULL AND record_key <> ''
              AND record_key NOT IN (SELECT record_key FROM ${TABLE})
            GROUP BY record_key
         )`
      )
    ).rows[0]?.c ?? 0
  );
  return { assigned, missing };
}

/** The current row id for a catalogue number, for resolving /records/RKR-000123.
 *
 * Returns null when the number's record_key is no longer in the catalogue.
 * That happens when the compiler changes a record's MATRIX NUMBER in his
 * spreadsheet: computeRecordKey is derived from the matrix number when there
 * is one, so editing it makes the record a different record as far as this
 * table is concerned, and it draws a fresh number on the next import while the
 * old number is left pointing at nothing.
 *
 * That is deliberate, and it is the safe direction. The alternative — guessing
 * which new record the orphaned number "really" means from artist/title/label —
 * would sometimes hand a reader a confidently wrong record, and in a reference
 * work a wrong answer is worse than a missing one. An orphaned number 404s. */
const cachedIdByNumber = unstable_cache(
  async (n: number): Promise<number | null> => {
    const client = await getClient();
    const res = await client.execute({
      sql: `SELECT r.id AS id
              FROM ${TABLE} n
              JOIN records r ON r.record_key = n.record_key
             WHERE n.number = ?
             ORDER BY r.id
             LIMIT 1`,
      args: [n],
    });
    const id = res.rows[0]?.id;
    return id == null ? null : Number(id);
  },
  ["record-id-by-number"],
  // A day, to match the record page. Next serves the SHORTEST revalidate of a
  // page and every cache its render touches, so an hour here would silently
  // cap all 135k record pages at an hour too. Every write flushes this by
  // tag, so freshness never depended on the window.
  { tags: [CATALOGUE_TAG], revalidate: 86_400 }
);

export async function getRecordIdByNumber(n: number): Promise<number | null> {
  // The catch is deliberately OUTSIDE the cached function. With it inside, a
  // failed query returned null and unstable_cache stored that null for the full
  // hour — so a transient database error would keep answering "no such record"
  // long after the database recovered. That is exactly the wrong behaviour
  // during the one event that causes transient errors here: a scrape burst
  // pushing Turso into rate-limiting. Out here, a failure is just a failure and
  // the next request tries again.
  try {
    return await cachedIdByNumber(n);
  } catch {
    return null;
  }
}

/** Catalogue numbers for a batch of live row ids, as id -> number.
 *
 * For lists that already know which records they're pointing at and need to
 * NAME them — the modification log, most of all. A raw row id is not a name:
 * it changes whenever the record is corrected, so a number written down from
 * that list stops meaning anything. The catalogue number is the stable one,
 * and it's the same number shown on the record's own page, so the two can
 * finally be cross-referenced.
 *
 * Missing ids simply don't appear in the map — a record numbered after the
 * next import, or before the first assignment run, has no number yet and the
 * caller falls back rather than inventing one. */
export async function getNumbersForRecordIds(ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return out;
  try {
    await ensureRecordNumbersTable();
    const client = await getClient();
    const res = await client.execute({
      sql: `SELECT r.id AS id, n.number AS number
              FROM records r
              JOIN ${TABLE} n ON n.record_key = r.record_key
             WHERE r.id IN (${unique.map(() => "?").join(", ")})`,
      args: unique,
    });
    for (const row of res.rows) {
      const rr = row as unknown as { id: number; number: number };
      out.set(Number(rr.id), Number(rr.number));
    }
  } catch {
    // No numbers table yet, or no record_key column — the caller shows the
    // fallback. A missing catalogue number must never break the log.
  }
  return out;
}
