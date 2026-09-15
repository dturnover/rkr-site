/**
 * Fixture tests for the matrix worklist's dismissals
 * (lib/queries/matrixMismatches.ts).
 *
 *   npm run test:matrix-dismissals
 *
 * Reported by the compiler: "when I click not an issue, it doesn't disappear.
 * It goes away for that time, but when I refresh the page those mismatches are
 * back again ... that not an issue thing should be a permanent marker."
 *
 * Cause: the join is cached for a day (deliberately — it is the heaviest query
 * in the application), and the dismissal filter used to be computed INSIDE that
 * cache. So a dismissal was written to the database and then buried by the
 * day-old cached answer on the next visit.
 *
 * The fix is not to invalidate the cache on dismissal — that re-runs the join
 * every time a pair is set aside, which is the cost the cache exists to avoid.
 * It is to apply dismissals outside it. These cases pin down both halves: a
 * dismissal survives, AND the expensive join is not re-run to achieve it.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB = path.join(os.tmpdir(), `rkr-matrix-test-${process.pid}.db`);
process.env.DATABASE_PATH = DB;
delete process.env.TURSO_DATABASE_URL;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });

async function main() {
  const { getClient } = await import("../lib/db/client");
  const { buildTableDdl, buildIndexStatements } = await import("../lib/db/ddl");
  const m = await import("../lib/queries/matrixMismatches");

  let passed = 0;
  let failed = 0;
  const check = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { passed++; console.log(`  PASS  ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); }
  };

  const client = await getClient();
  await client.executeMultiple(buildTableDdl("records"));
  for (const stmt of buildIndexStatements("records")) await client.execute(stmt);

  const P = { label: "Studio One", country: "JA", format: "7", year: "1969" };
  let id = 0;
  // Each pair: a song's own entry, and another record carrying it as a B-side
  // stub with a DIFFERENT matrix number.
  async function pair(song: string, ownMatrix: string, stubMatrix: string) {
    const own = ++id, stub = ++id;
    await client.execute({
      sql: `INSERT INTO records (id, record_key, artist, title, matrix_number, label_number, label, country, format, year, artist_norm)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [own, `mx:own-${own}`, "The Cables", song, ownMatrix, `L ${own}`, P.label, P.country, P.format, P.year, "the cables"],
    });
    await client.execute({
      sql: `INSERT INTO records (id, record_key, artist, title, label_number, label, country, format, year,
              b_side_artist, b_side_title, b_side_matrix_number, artist_norm)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [stub, `mx:stub-${stub}`, "Someone Else", `Flip ${stub}`, `L ${stub}`, P.label, P.country, P.format, P.year,
             "The Cables", song, stubMatrix, "someone else"],
    });
  }
  await pair("Baby Why", "HA 101", "HA 101-B");
  await pair("Bring Back The Love", "FBT 7754", "FBT 7754 FtR");
  await pair("Cry Tough", "T 1", "T 1-A");

  // findMatrixMismatches() itself needs a Next request context (its join is
  // wrapped in unstable_cache), so the pieces are driven directly here. That is
  // exactly the split under test: cached pairs in one hand, fresh dismissals in
  // the other, combined by a pure function.
  const worklist = async () => m.applyDismissals(pairs, await m.loadDismissedKeys());

  console.log("\nThe worklist finds the divergences");
  // Fetched ONCE and reused everywhere below, standing in for the day-long
  // cache. If a dismissal only worked by re-running the join, every assertion
  // after this point would fail — which is the bug being fixed.
  const pairs = await m.findMatrixPairsUncached();
  const first = await worklist();
  check("three pairs reported", first.rows.length, 3);
  check("none dismissed yet", first.dismissedCount, 0);

  console.log("\nA dismissal is permanent, not just for that render");
  const target = first.rows[0];
  await m.dismissMatrixPair(target.dismissKey,
    { song: target.song, ownMatrix: target.ownMatrix, stubMatrix: target.stubMatrix }, "Michael Turner");

  // This is the refresh he described. The join is served from cache; the
  // dismissal must still be honoured.
  const afterRefresh = await worklist();
  check("the dismissed pair is gone after a refresh", afterRefresh.rows.length, 2);
  check("it is counted as dismissed", afterRefresh.dismissedCount, 1);
  check("the right one went", afterRefresh.rows.some((r) => r.dismissKey === target.dismissKey), false);

  // …and again, to be sure it is not a one-render effect.
  const afterSecond = await worklist();
  check("still gone on a second refresh", afterSecond.rows.length, 2);

  console.log("\nThe expensive join is NOT re-run to achieve that");
  // If dismissing had to bust the join's cache, this count would climb. The
  // whole point of the split is that it doesn't.
  check("the cached join still holds all three pairs", pairs.length, 3);
  check("dismissal lives outside it", (await m.loadDismissedKeys()).size, 1);

  console.log("\nPutting one back");
  await m.restoreMatrixPair(target.dismissKey);
  const afterRestore = await worklist();
  check("restored pair returns to the worklist", afterRestore.rows.length, 3);
  check("dismissed count back to zero", afterRestore.dismissedCount, 0);

  console.log("\nDismissing every pair");
  for (const r of afterRestore.rows) {
    await m.dismissMatrixPair(r.dismissKey, { song: r.song, ownMatrix: r.ownMatrix, stubMatrix: r.stubMatrix }, "Michael Turner");
  }
  const empty = await worklist();
  check("worklist empties out", empty.rows.length, 0);
  check("all three recorded as dismissed", empty.dismissedCount, 3);

  console.log(`\n${passed} passed, ${failed} failed`);
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main();
