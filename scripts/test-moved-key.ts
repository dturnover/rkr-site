/**
 * Fixture tests for modification-log record recovery (lib/editor/overlay.ts:
 * movedKeyFor and resolveLiveRecordIds' third pass).
 *
 *   npm run test:moved-key
 *
 * The bug this covers, as reported by the compiler: "Some items have appeared
 * here without a record number. So I can't actually see what modification was
 * made. Because I can't find it or go to it."
 *
 * Cause: computeRecordKey is derived from the record's own content, so an
 * editor correcting a matrix number (or, on a record with no matrix number, a
 * label number / artist / title) changes the record's identity. setFieldEdit
 * pins the original key on the row, which holds until the compiler makes the
 * same correction in his spreadsheet — from that upload on, the record is
 * rebuilt under its new key and every log entry filed under the old one
 * dangles.
 *
 * The recovery is NOT a guess: the log entry records the very change that
 * moved the key, so the new key is rebuilt from it. These cases pin down both
 * that it works and that it declines to answer when it cannot be certain — a
 * confidently wrong link out of this list is worse than the dash it replaces,
 * because an edit made on the wrong record looks deliberate.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB = path.join(os.tmpdir(), `rkr-movedkey-test-${process.pid}.db`);
process.env.DATABASE_PATH = DB;
delete process.env.TURSO_DATABASE_URL;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });

async function main() {
  const { getClient } = await import("../lib/db/client");
  const { buildTableDdl, buildIndexStatements } = await import("../lib/db/ddl");
  const { movedKeyFor, computeRecordKey, getGlobalLog } = await import("../lib/editor/overlay");

  let passed = 0;
  let failed = 0;
  const check = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { passed++; console.log(`  PASS  ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); }
  };

  console.log("\nRebuilding the moved key from the logged change");
  check("a new matrix number names the whole new key",
    movedKeyFor("mx:f&r", "matrix_number", "FBT 7754 FtR"), "mx:fbt 7754 ftr");
  check("case and repeated spaces normalise the same way computeRecordKey does",
    movedKeyFor("mx:old", "matrix_number", "  FBT   7754  FtR "),
    computeRecordKey({ matrix_number: "  FBT   7754  FtR " }));
  check("a matrix number replaces an lk: key outright",
    movedKeyFor("lk:fbt 7754|the silvertones|rejoice", "matrix_number", "ABC 1"), "mx:abc 1");
  check("artist replaces just its own part of an lk: key",
    movedKeyFor("lk:fbt 7754|the diamonds|rejoice", "artist", "The Silvertones"),
    "lk:fbt 7754|the silvertones|rejoice");
  check("title replaces just its own part",
    movedKeyFor("lk:t 1|artist|love??", "title", "Bring Back The Love"),
    "lk:t 1|artist|bring back the love");
  check("label number replaces just its own part",
    movedKeyFor("lk:old no|artist|song", "label_number", "NEW 9"), "lk:new 9|artist|song");

  console.log("\nDeclining to answer");
  check("an artist edit cannot move an mx: key", movedKeyFor("mx:abc 1", "artist", "Whoever"), null);
  check("a title edit cannot move an mx: key", movedKeyFor("mx:abc 1", "title", "Whatever"), null);
  check("a cleared matrix number is not reconstructable",
    movedKeyFor("mx:abc 1", "matrix_number", ""), null);
  check("a field that forms no part of the key is ignored",
    movedKeyFor("lk:a|b|c", "year", "1972"), null);
  check("a non-key field on an mx: key is ignored",
    movedKeyFor("mx:abc 1", "producer", "Coxsone"), null);
  check("an lk: key that doesn't split into three is left alone",
    movedKeyFor("lk:only|two", "artist", "X"), null);
  check("a missing field name yields nothing", movedKeyFor("mx:abc 1", null, "X"), null);

  // ---- End to end, through the real log resolver ----
  const client = await getClient();
  await client.executeMultiple(buildTableDdl("records"));
  for (const stmt of buildIndexStatements("records")) await client.execute(stmt);
  await client.execute(`CREATE TABLE IF NOT EXISTS modification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, record_key TEXT, record_id INTEGER, action TEXT NOT NULL,
    field TEXT, old_value TEXT, new_value TEXT, editor_id INTEGER, editor_name TEXT,
    created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT, note TEXT, note_at TEXT, note_by TEXT)`);

  let clock = 0;
  const addRecord = (id: number, key: string, r: Record<string, string | null>) =>
    client.execute({
      sql: `INSERT INTO records (id, record_key, artist, title, matrix_number, label_number, artist_norm)
            VALUES (?,?,?,?,?,?,?)`,
      args: [id, key, r.artist ?? null, r.title ?? null, r.matrix ?? null, r.labelNo ?? null,
             r.artist ? r.artist.toLowerCase() : null],
    });
  const addLog = (key: string, recordId: number, field: string, from: string, to: string) =>
    client.execute({
      sql: `INSERT INTO modification_log (record_key, record_id, action, field, old_value, new_value, editor_name, created_at)
            VALUES (?, ?, 'modified', ?, ?, ?, 'Brian Keyo', ?)`,
      args: [key, recordId, field, from, to, new Date(Date.now() + clock++).toISOString()],
    });
  const liveIdFor = async (field: string) => {
    const { entries } = await getGlobalLog(1, "all", 200);
    return entries.find((e) => e.field === field)?.live_record_id ?? null;
  };

  console.log("\nThe reported bug, end to end");
  // The compiler's spreadsheet has caught up with the editor's matrix
  // correction, so the record was rebuilt under a new key with a new id.
  await addLog("mx:f&r", 1, "matrix_number", "F&R", "FBT 7754 FtR");
  await addRecord(140001, "mx:fbt 7754 ftr",
    { artist: "The Silvertones", title: "Rejoice", matrix: "FBT 7754 FtR", labelNo: "FBT 7754" });
  check("a matrix correction is reachable again", await liveIdFor("matrix_number"), 140001);

  // Edits made to the SAME record before its key moved must come back too —
  // they name no key-forming change themselves, so they rely on the move
  // being learned from the entry that did.
  await addLog("mx:f&r", 1, "producer", "", "Lloyd Daley");
  check("that record's earlier history comes back with it", await liveIdFor("producer"), 140001);

  console.log("\nAmbiguity and absence");
  // Two records answer to the reconstructed key: the log cannot say which one
  // this history belongs to, so it must not choose.
  await addLog("mx:ambiguous", 2, "matrix_number", "old", "DUP 1");
  await addRecord(200, "mx:dup 1", { artist: "A", title: "One", matrix: "DUP 1" });
  await addRecord(201, "mx:dup 1", { artist: "B", title: "Two", matrix: "DUP 1" });
  const page = (await getGlobalLog(1, "all", 200)).entries;
  const ambiguous = page.find((e) => e.old_value === "old")?.live_record_id ?? null;
  check("the ambiguous entry resolves to nothing", ambiguous, null);
  // …and introducing an ambiguous entry must not disturb one that was already
  // resolving: each old key is looked up on its own.
  const stillGood = page.find((e) => e.old_value === "F&R")?.live_record_id ?? null;
  check("an unrelated entry keeps resolving alongside it", stillGood, 140001);

  // Nothing landed there at all.
  await addLog("mx:gone", 3, "matrix_number", "x", "NOTHING HERE");
  const missing = (await getGlobalLog(1, "all", 200)).entries
    .find((e) => e.new_value === "NOTHING HERE")?.live_record_id ?? null;
  check("a key that matches no record resolves to nothing", missing, null);

  console.log(`\n${passed} passed, ${failed} failed`);
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main();
