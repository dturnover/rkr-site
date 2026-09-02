/**
 * Fixture tests for clearing a field on the site (lib/import/importCsv.ts,
 * streamTargetRows' overlay merge).
 *
 *   npm run test:cleared-fields
 *
 * Reported by the compiler: a record carried Issue Notes "pre", he wanted it
 * gone, and the edit form had no field for it. Two faults sat behind that. The
 * field wasn't in EDITABLE_FIELDS at all — and, worse, even a field he COULD
 * clear didn't stay cleared: the merge skipped any override whose value was
 * null, so his next upload put the old value straight back with no error and
 * nothing in the log to explain it.
 *
 * These cases pin down that a deliberate clear is treated as a correction like
 * any other, and that it still loses to a genuinely new value from the
 * spreadsheet the same way a non-empty correction does.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB = path.join(os.tmpdir(), `rkr-cleared-test-${process.pid}.db`);
process.env.DATABASE_PATH = DB;
delete process.env.TURSO_DATABASE_URL;
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });

async function main() {
  const { getClient } = await import("../lib/db/client");
  const { streamTargetRows, CSV_FIELDS } = await import("../lib/import/importCsv");
  const { computeRecordKey, getOverlayForMerge, EDITABLE_FIELDS } = await import("../lib/editor/overlay");

  let passed = 0;
  let failed = 0;
  const check = (label: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) { passed++; console.log(`  PASS  ${label}`); }
    else { failed++; console.log(`  FAIL  ${label}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); }
  };

  const client = await getClient();
  await client.execute(`CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, record_key TEXT)`);
  await getOverlayForMerge(); // creates the overlay tables

  /** One row of the compiler's spreadsheet, as a CSV buffer. */
  function sheet(row: Record<string, string>): Buffer {
    const line = CSV_FIELDS.map((f) => `"${(row[f] ?? "").replace(/"/g, '""')}"`).join(",");
    return Buffer.from([CSV_FIELDS.join(","), line].join("\n"), "utf8");
  }
  async function override(key: string, field: string, value: string | null, base: string | null) {
    await client.execute({
      sql: `INSERT INTO editor_field_edits (record_key, field, value, base_value, has_base, editor_name, updated_at)
            VALUES (?, ?, ?, ?, 1, 'Michael', ?)
            ON CONFLICT(record_key, field) DO UPDATE SET value = excluded.value, base_value = excluded.base_value`,
      args: [key, field, value, base, new Date().toISOString()],
    });
  }
  async function importedRow(row: Record<string, string>) {
    for await (const out of streamTargetRows(sheet(row))) return out;
    return null;
  }

  console.log("\nIssue Notes is editable at all");
  check("pressing is in EDITABLE_FIELDS", (EDITABLE_FIELDS as readonly string[]).includes("pressing"), true);

  console.log("\nA cleared field stays cleared");
  // The compiler's own case: Issue Notes "pre", cleared on the site, and his
  // spreadsheet still says "pre" on the next upload.
  const rec = { artist: "Stranger Cole", title: "My Application",
                matrix_number: "Dyna SC 3881-1 SWB", pressing: "pre", year: "1971" };
  const key = computeRecordKey(rec);
  await override(key, "pressing", null, "pre");
  check("Issue Notes stays gone after the next upload", (await importedRow(rec))?.pressing, null);

  // The same must hold for any other field, since the bug was general.
  const rec2 = { artist: "A", title: "B", matrix_number: "MX 2", notes: "some note" };
  const key2 = computeRecordKey(rec2);
  await override(key2, "notes", null, "some note");
  check("a cleared Notes stays gone too", (await importedRow(rec2))?.notes, null);

  console.log("\nA clear is still only a correction, not a veto");
  // If the compiler CHANGES the value himself, his new value wins — a clear
  // gets no more authority than any other correction. Otherwise clearing a
  // field once would suppress that field forever.
  const rec3 = { artist: "C", title: "D", matrix_number: "MX 3", pressing: "pre" };
  const key3 = computeRecordKey(rec3);
  await override(key3, "pressing", null, "pre");
  check("his genuinely new value wins over a clear",
    (await importedRow({ ...rec3, pressing: "reissue" }))?.pressing, "reissue");

  // And a non-empty correction still behaves as it always did.
  const rec4 = { artist: "E", title: "F", matrix_number: "MX 4", pressing: "pre" };
  const key4 = computeRecordKey(rec4);
  await override(key4, "pressing", "reissue", "pre");
  check("a non-empty correction still applies", (await importedRow(rec4))?.pressing, "reissue");

  console.log("\nClearing a field the compiler had already left blank");
  const rec5 = { artist: "G", title: "H", matrix_number: "MX 5" };
  const key5 = computeRecordKey(rec5);
  await override(key5, "pressing", null, null);
  check("stays blank, changes nothing", (await importedRow(rec5))?.pressing, null);

  console.log(`\n${passed} passed, ${failed} failed`);
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB + suffix, { force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main();
