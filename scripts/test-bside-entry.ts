/**
 * Fixture tests for the B-side shortcut (lib/queries/bSideEntry.ts).
 *
 *   npm run test:bside-entry
 *
 * Builds a throwaway SQLite file, fills it with records shaped like the real
 * catalogue's awkward cases, and asserts what the lookup does with each.
 *
 * Retained rather than thrown away because this is DERIVED data: the rule for
 * "this B-side stub and that entry are the same song" has already been wrong
 * once in production (matching on label, artist and title alone paired a
 * Jamaican side with a UK side), and the fix was to require country, format
 * and year to agree too. These cases pin that rule down so it can't be quietly
 * loosened later by someone who only sees that the strictness costs matches.
 *
 * The bar throughout: a wrong link is worse than no link. An editor sent to
 * the wrong record makes a real edit that looks deliberate.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { BSideAnchor } from "../lib/queries/bSideEntry";

const DB = path.join(os.tmpdir(), `rkr-bside-test-${process.pid}.db`);
process.env.DATABASE_PATH = DB;
delete process.env.TURSO_DATABASE_URL;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });

async function main() {
  const { getClient } = await import("../lib/db/client");
  const { buildTableDdl, buildIndexStatements } = await import("../lib/db/ddl");
  const { findBSideEntryUncached } = await import("../lib/queries/bSideEntry");

  let passed = 0;
  let failed = 0;
  function check(label: string, got: unknown, want: unknown) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) {
      passed++;
      console.log(`  PASS  ${label}`);
    } else {
      failed++;
      console.log(`  FAIL  ${label}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
    }
  }

  interface Row {
    id: number;
    artist?: string | null;
    title?: string | null;
    matrix?: string | null;
    labelNo?: string | null;
    label?: string | null;
    country?: string | null;
    format?: string | null;
    year?: string | null;
    bArtist?: string | null;
    bTitle?: string | null;
    bMatrix?: string | null;
    bLabelNo?: string | null;
  }

  const client = await getClient();
  await client.executeMultiple(buildTableDdl("records"));
  for (const stmt of buildIndexStatements("records")) await client.execute(stmt);

  async function add(r: Row) {
    const norm = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v.trim().toLowerCase());
    await client.execute({
      sql: `INSERT INTO records
              (id, record_key, artist, title, matrix_number, label_number, label, country, format, year,
               b_side_artist, b_side_title, b_side_matrix_number, b_side_label_number,
               artist_norm, label_norm, country_norm, format_norm)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        r.id, `mx:test-${r.id}`, r.artist ?? null, r.title ?? null, r.matrix ?? null, r.labelNo ?? null,
        r.label ?? null, r.country ?? null, r.format ?? null, r.year ?? null,
        r.bArtist ?? null, r.bTitle ?? null, r.bMatrix ?? null, r.bLabelNo ?? null,
        norm(r.artist), norm(r.label), norm(r.country), norm(r.format),
      ],
    });
  }

  /** The anchor the record page builds, derived from a stub row. */
  async function anchorFor(id: number): Promise<BSideAnchor> {
    const res = await client.execute({
      sql: `SELECT id, b_side_artist, b_side_title, label, country, format, year FROM records WHERE id = ?`,
      args: [id],
    });
    return res.rows[0] as unknown as BSideAnchor;
  }

  const idFor = async (stubId: number) => (await findBSideEntryUncached(await anchorFor(stubId)))?.id ?? null;

  const PRESSING = { label: "Studio One", country: "JA", format: "7", year: "1969" };

  console.log("\nThe case this exists for");
  // 1. A stub whose song has its own entry, with a DIFFERENT matrix number —
  //    which is the normal state of the catalogue, not an edge case.
  await add({ id: 1, artist: "The Cables", title: "Baby Why", matrix: "HA 101", labelNo: "HA 101",
    ...PRESSING, bArtist: "Sound Dimension", bTitle: "Baby Why Version", bMatrix: "HA 101-B" });
  await add({ id: 2, artist: "Sound Dimension", title: "Baby Why Version", matrix: "SO 55-A",
    labelNo: "SO 55", ...PRESSING });
  check("stub finds its song's own entry", await idFor(1), 2);

  // The stub above carries "HA 101-B" while the entry carries "SO 55-A", so
  // that match already proves a differing matrix number doesn't block it. The
  // other half of the same point: a stub with NO matrix number at all — the
  // older entries, before the full matrix was understood to matter — still
  // reaches its entry, which is precisely the population an editor is cleaning.
  await add({ id: 3, artist: "The Ethiopians", title: "Train To Skaville", labelNo: "T 21",
    ...PRESSING, bArtist: "The Ethiopians", bTitle: "Train To Glory", bMatrix: null });
  await add({ id: 4, artist: "The Ethiopians", title: "Train To Glory", matrix: "WIRL 1234",
    labelNo: "T 22", ...PRESSING });
  check("a stub with no matrix number still finds its entry", await idFor(3), 4);

  console.log("\nPressing must agree (the Jamaican/UK false pair)");
  // 2-5. Same song, same label — but a different pressing is a different record.
  await add({ id: 10, artist: "Alton Ellis", title: "Girl I've Got A Date", labelNo: "T 1",
    ...PRESSING, bArtist: "The Flames", bTitle: "Cry Tough" });
  await add({ id: 11, artist: "The Flames", title: "Cry Tough", labelNo: "T 2",
    label: "Studio One", country: "UK", format: "7", year: "1969" });
  check("different country is a different record", await idFor(10), null);

  await add({ id: 20, artist: "Ken Boothe", title: "The Train Is Coming", labelNo: "T 3",
    ...PRESSING, bArtist: "Roland Al", bTitle: "Cool Breeze" });
  await add({ id: 21, artist: "Roland Al", title: "Cool Breeze", labelNo: "T 4",
    label: "Studio One", country: "JA", format: "12", year: "1969" });
  check("different format is a different record", await idFor(20), null);

  await add({ id: 30, artist: "Delroy Wilson", title: "Dancing Mood", labelNo: "T 5",
    ...PRESSING, bArtist: "The Soul Vendors", bTitle: "Wild Flower" });
  await add({ id: 31, artist: "The Soul Vendors", title: "Wild Flower", labelNo: "T 6",
    label: "Studio One", country: "JA", format: "7", year: "1974" });
  check("different year is a different record", await idFor(30), null);

  await add({ id: 40, artist: "Marcia Griffiths", title: "Feel Like Jumping", labelNo: "T 7",
    ...PRESSING, bArtist: "Jackie Mittoo", bTitle: "Ram Jam" });
  await add({ id: 41, artist: "Jackie Mittoo", title: "Ram Jam", labelNo: "T 8",
    label: "Coxsone", country: "JA", format: "7", year: "1969" });
  check("different label is a different record", await idFor(40), null);

  console.log("\nAmbiguity resolves to nothing, never to a guess");
  // 6. Two entries answer to the same song on the same pressing. The catalogue
  //    cannot say which one the stub means, so it must not choose.
  await add({ id: 50, artist: "Slim Smith", title: "Never Let Go", labelNo: "T 9",
    ...PRESSING, bArtist: "The Uniques", bTitle: "My Conversation" });
  await add({ id: 51, artist: "The Uniques", title: "My Conversation", labelNo: "T 10", ...PRESSING });
  await add({ id: 52, artist: "The Uniques", title: "My Conversation", labelNo: "T 11", ...PRESSING });
  check("two candidates means no link", await idFor(50), null);

  console.log("\nNothing to match on");
  await add({ id: 60, artist: "Bob Andy", title: "Unchained", labelNo: "T 12", ...PRESSING,
    bArtist: "Bob Andy", bTitle: null });
  check("blank B-side title gives no link", await idFor(60), null);

  await add({ id: 61, artist: "John Holt", title: "Ali Baba", labelNo: "T 13", ...PRESSING,
    bArtist: "Nobody At All", bTitle: "A Song With No Entry" });
  check("no such entry gives no link", await idFor(61), null);

  console.log("\nSelf-reference");
  // 7. A record whose own A side happens to equal its B side must not link to
  //    itself — an infinite "open the B side" loop back onto the same page.
  await add({ id: 70, artist: "Same Artist", title: "Same Song", labelNo: "T 14", ...PRESSING,
    bArtist: "Same Artist", bTitle: "Same Song" });
  check("a record never links to itself", await idFor(70), null);

  console.log("\nBlank artists");
  // 8. A flip side by the same artist is often left blank in the B-side artist
  //    column. The established rule matches blank against blank.
  await add({ id: 80, artist: "Instrumental A", title: "Side One", labelNo: "T 15", ...PRESSING,
    bArtist: null, bTitle: "Untitled Flip" });
  await add({ id: 81, artist: null, title: "Untitled Flip", labelNo: "T 16", ...PRESSING });
  check("blank B-side artist matches a blank artist", await idFor(80), 81);

  // 9. …and must NOT match an entry that does name an artist, or every unattributed
  //    stub would attach itself to the first same-titled song in the catalogue.
  await add({ id: 90, artist: "Something", title: "Side One B", labelNo: "T 17", ...PRESSING,
    bArtist: null, bTitle: "Named Flip" });
  await add({ id: 91, artist: "An Actual Artist", title: "Named Flip", labelNo: "T 18", ...PRESSING });
  check("blank B-side artist does not match a named artist", await idFor(90), null);

  console.log("\nMessy but equivalent values");
  // 10. Decades of hand entry: case and padding vary constantly and must not
  //     decide whether two rows are the same song.
  await add({ id: 100, artist: "Toots", title: "Pressure Drop", labelNo: "T 19",
    label: "  studio one ", country: "ja", format: "7", year: "1969",
    bArtist: "  THE MAYTALS  ", bTitle: "  monkey MAN  " });
  await add({ id: 101, artist: "The Maytals", title: "Monkey Man", labelNo: "T 20", ...PRESSING });
  check("case and surrounding space are ignored", await idFor(100), 101);

  console.log("\nWhat the lookup hands back");
  const entry = await findBSideEntryUncached(await anchorFor(1));
  check("returns the entry's identity for display", entry, {
    id: 2, artist: "Sound Dimension", title: "Baby Why Version",
    label_number: "SO 55", matrix_number: "SO 55-A",
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });
  process.exit(failed === 0 ? 0 : 1);

}

main();
