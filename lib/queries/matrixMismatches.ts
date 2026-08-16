import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG } from "@/lib/cacheTags";

// A worklist of songs whose matrix number is recorded one way on their own
// entry and another way where they appear as somebody else's B side.
//
// The same song is stored twice — once as an entry of its own, once as a stub
// on the back of its pair — and the two drifted apart historically: early on
// only partial matrix numbers were entered in the B-side column, before the
// full matrix was understood to matter. The compiler is cleaning those up by
// hand, so this finds them rather than guessing at fixes. Nothing here writes.

const INDEX_NAME = "idx_records_bside_title_norm";

/** The join below matches a song's title against every B-side title in the
 * catalogue, which without an index is 135k x 135k comparisons. SQLite can
 * index the expression itself, turning that into a seek.
 *
 * Created on demand rather than during import, because a full import builds a
 * fresh table and renames the old one — taking this index with it, since
 * SQLite renames tables but not their indexes. So the name may still exist,
 * attached to the previous generation; PRAGMA tells us whether the LIVE table
 * has it, and the stale one is dropped before rebuilding. */
async function ensureIndex(): Promise<void> {
  const client = await getClient();
  const list = await client.execute(`PRAGMA index_list(records)`);
  const present = list.rows.some(
    (r) => String((r as unknown as { name: string }).name) === INDEX_NAME
  );
  if (present) return;
  await client.execute(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  await client.execute(`CREATE INDEX ${INDEX_NAME} ON records(lower(trim(b_side_title)))`);
}

export interface MatrixMismatch {
  song: string;
  artist: string | null;
  label: string | null;
  /** The pressing, shown so a wrong pair is obvious rather than trusted. */
  country: string | null;
  year: string | null;
  format: string | null;
  /** The song's own entry — where the matrix number is authoritative. */
  ownId: number;
  ownLabelNumber: string | null;
  ownMatrix: string;
  /** The entry carrying it as a B-side stub. */
  stubId: number;
  stubLabelNumber: string | null;
  stubMatrix: string;
  /** How much of the two matrix numbers agrees before they diverge. */
  sharedPrefix: string;
  /** Stable handle for setting this pair aside; see dismissKeyOf. */
  dismissKey: string;
}

/** The leading run both values agree on, compared case-insensitively but
 * returned as written. The compiler's rule of thumb is that matrix numbers
 * agree through the letter-and-number stem ("DSR 1234") and diverge after it,
 * so showing the shared part makes the actual difference obvious. */
export function sharedPrefixOf(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  let i = 0;
  while (i < x.length && i < y.length && x[i].toLowerCase() === y[i].toLowerCase()) i++;
  return x.slice(0, i);
}

const MAX_ROWS = 500;
// Fetched before dismissals are filtered out, so a page still fills up once a
// few hundred pairs have been set aside.
const FETCH_LIMIT = 4000;

const DISMISS_TABLE = `
  CREATE TABLE IF NOT EXISTS matrix_dismissals (
    dismiss_key   TEXT PRIMARY KEY,
    song          TEXT,
    own_matrix    TEXT,
    stub_matrix   TEXT,
    dismissed_by  TEXT,
    dismissed_at  TEXT NOT NULL
  )`;

let dismissEnsured: Promise<void> | null = null;
function ensureDismissTable(): Promise<void> {
  if (!dismissEnsured) {
    dismissEnsured = (async () => {
      const client = await getClient();
      await client.execute(DISMISS_TABLE);
    })().catch((err) => {
      dismissEnsured = null;
      throw err;
    });
  }
  return dismissEnsured;
}

/** Identifies one divergence across imports.
 *
 * Row ids are reassigned by every rebuild, so a dismissal keyed on them would
 * come undone — and worse, could later suppress an unrelated pair that
 * inherited the id. The content-derived record keys are stable, and the two
 * matrix values are included deliberately: setting a divergence aside is a
 * judgement about THESE values, so if either is edited afterwards the pair is
 * a new question and comes back. */
export function dismissKeyOf(parts: {
  ownKey: string | null;
  stubKey: string | null;
  ownMatrix: string;
  stubMatrix: string;
}): string {
  const n = (v: string | null) => (v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return [n(parts.ownKey), n(parts.stubKey), n(parts.ownMatrix), n(parts.stubMatrix)].join("\u0001");
}

export async function dismissMatrixPair(
  key: string,
  info: { song: string; ownMatrix: string; stubMatrix: string },
  who: string
): Promise<void> {
  await ensureDismissTable();
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO matrix_dismissals
            (dismiss_key, song, own_matrix, stub_matrix, dismissed_by, dismissed_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(dismiss_key) DO NOTHING`,
    args: [key, info.song, info.ownMatrix, info.stubMatrix, who, new Date().toISOString()],
  });
}

export async function restoreMatrixPair(key: string): Promise<void> {
  await ensureDismissTable();
  const client = await getClient();
  await client.execute({ sql: `DELETE FROM matrix_dismissals WHERE dismiss_key = ?`, args: [key] });
}

export interface DismissedPair {
  dismiss_key: string;
  song: string | null;
  own_matrix: string | null;
  stub_matrix: string | null;
  dismissed_by: string | null;
  dismissed_at: string;
}

export async function listDismissedPairs(): Promise<DismissedPair[]> {
  await ensureDismissTable();
  const client = await getClient();
  const res = await client.execute(
    `SELECT dismiss_key, song, own_matrix, stub_matrix, dismissed_by, dismissed_at
     FROM matrix_dismissals ORDER BY dismissed_at DESC LIMIT 500`
  );
  return res.rows as unknown as DismissedPair[];
}

export async function findMatrixMismatchesUncached(): Promise<{
  rows: MatrixMismatch[];
  capped: boolean;
  dismissedCount: number;
}> {
  await ensureIndex();
  const client = await getClient();

  // Two entries only describe the same physical record if they agree on every
  // fact that identifies the pressing. Matching on label, artist and title
  // alone paired a Jamaican side with a UK side — the same song, the same
  // label, genuinely different records with genuinely different matrix
  // numbers, reported as a fault. Country, format and year are what tell
  // pressings apart, so all three must agree.
  //
  // Both sides must also carry a matrix number: a blank stub is an omission,
  // not the divergence being hunted.
  const res = await client.execute({
    sql: `SELECT a.id AS own_id, a.artist, a.title, a.matrix_number AS own_matrix,
                 a.label_number AS own_label_no, a.label, a.country, a.year, a.format,
                 a.record_key AS own_key, b.record_key AS stub_key,
                 b.id AS stub_id, b.b_side_matrix_number AS stub_matrix,
                 b.label_number AS stub_label_no
          FROM records a
          JOIN records b
            ON lower(trim(b.b_side_title)) = lower(trim(a.title))
           AND b.id <> a.id
           AND lower(trim(coalesce(b.b_side_artist, ''))) = lower(trim(coalesce(a.artist, '')))
           AND lower(trim(coalesce(b.label, ''))) = lower(trim(coalesce(a.label, '')))
           AND lower(trim(coalesce(b.country, ''))) = lower(trim(coalesce(a.country, '')))
           AND lower(trim(coalesce(b.format, ''))) = lower(trim(coalesce(a.format, '')))
           AND lower(trim(coalesce(b.year, ''))) = lower(trim(coalesce(a.year, '')))
          WHERE trim(coalesce(a.title, '')) <> ''
            AND trim(coalesce(a.matrix_number, '')) <> ''
            AND trim(coalesce(b.b_side_matrix_number, '')) <> ''
            AND lower(trim(b.b_side_matrix_number)) <> lower(trim(a.matrix_number))
          ORDER BY a.label, a.matrix_number
          LIMIT ?`,
    args: [FETCH_LIMIT],
  });

  const all = res.rows.map((r) => {
    const x = r as unknown as Record<string, string | number | null>;
    const ownMatrix = String(x.own_matrix ?? "");
    const stubMatrix = String(x.stub_matrix ?? "");
    return {
      song: String(x.title ?? ""),
      artist: x.artist == null ? null : String(x.artist),
      label: x.label == null ? null : String(x.label),
      country: x.country == null ? null : String(x.country),
      year: x.year == null ? null : String(x.year),
      format: x.format == null ? null : String(x.format),
      ownId: Number(x.own_id),
      ownLabelNumber: x.own_label_no == null ? null : String(x.own_label_no),
      ownMatrix,
      stubId: Number(x.stub_id),
      stubLabelNumber: x.stub_label_no == null ? null : String(x.stub_label_no),
      stubMatrix,
      sharedPrefix: sharedPrefixOf(ownMatrix, stubMatrix),
      dismissKey: dismissKeyOf({
        ownKey: x.own_key == null ? null : String(x.own_key),
        stubKey: x.stub_key == null ? null : String(x.stub_key),
        ownMatrix,
        stubMatrix,
      }),
    };
  });

  // Pairs the compiler has judged unresolvable or wrongly matched drop out
  // entirely — the list is a worklist, and one that keeps showing settled
  // questions stops being read.
  await ensureDismissTable();
  const dismissedRes = await client.execute(`SELECT dismiss_key FROM matrix_dismissals`);
  const dismissed = new Set(
    dismissedRes.rows.map((r) => String((r as unknown as { dismiss_key: string }).dismiss_key))
  );
  const live = all.filter((m) => !dismissed.has(m.dismissKey));

  return {
    rows: live.slice(0, MAX_ROWS),
    capped: live.length > MAX_ROWS,
    dismissedCount: dismissed.size,
  };
}

// The join reads the whole catalogue, so hold the result until an upload or an
// edit changes something rather than recomputing it per page view.
export const findMatrixMismatches = unstable_cache(
  findMatrixMismatchesUncached,
  ["matrix-mismatches"],
  { tags: [CATALOGUE_TAG], revalidate: 3600 }
);
