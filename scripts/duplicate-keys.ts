/**
 * Read-only report on records that SHARE a record_key, and therefore share a
 * catalogue number.
 *
 *   npm run duplicate-keys
 *
 * Runs against whatever TURSO_DATABASE_URL / DATABASE_PATH already points at.
 * Writes nothing.
 *
 * Why this exists: /admin reports fewer numbered entries than the catalogue has
 * rows, and "nothing is waiting". Both are true at once because a number is
 * filed against record_key (matrix number, else label no + artist + title), and
 * more than one row can answer to the same key. Those rows share one number and
 * are not individually citable.
 *
 * The question this answers is whether that gap is genuine duplication (the
 * same entry twice, harmless) or distinct pressings colliding (two real records
 * the key can't tell apart, which is the case worth acting on) — country,
 * format and year are NOT part of the key, so a Jamaican and a UK pressing of
 * the same song on the same label collide unless a matrix number separates
 * them.
 */
import { getClient } from "../lib/db/client";
import { CSV_FIELDS, contentHashOf } from "../lib/import/importCsv";

const PRESSING_FIELDS = ["country", "format", "year"] as const;
const n = (v: number) => v.toLocaleString();

async function main() {
  const client = await getClient();
  const target = process.env.TURSO_DATABASE_URL ? "Turso" : "local file";
  console.log(`Reading ${target}. Nothing is written.\n`);

  const totalRows = Number(
    (await client.execute(`SELECT COUNT(*) AS c FROM records`)).rows[0]?.c ?? 0
  );
  const distinctKeys = Number(
    (
      await client.execute(
        `SELECT COUNT(*) AS c FROM (
           SELECT record_key FROM records
            WHERE record_key IS NOT NULL AND record_key <> '' GROUP BY record_key)`
      )
    ).rows[0]?.c ?? 0
  );
  const keyless = Number(
    (
      await client.execute(
        `SELECT COUNT(*) AS c FROM records WHERE record_key IS NULL OR record_key = ''`
      )
    ).rows[0]?.c ?? 0
  );

  const sharedRes = await client.execute(
    `SELECT record_key, COUNT(*) AS c FROM records
      WHERE record_key IS NOT NULL AND record_key <> ''
      GROUP BY record_key HAVING COUNT(*) > 1
      ORDER BY c DESC`
  );
  const sharedKeys = sharedRes.rows.map((r) => ({
    key: String((r as unknown as { record_key: string }).record_key),
    count: Number((r as unknown as { c: number }).c),
  }));
  const rowsInShared = sharedKeys.reduce((a, k) => a + k.count, 0);

  console.log(`Rows in the catalogue          ${n(totalRows)}`);
  console.log(`Distinct record keys           ${n(distinctKeys)}   <- what /admin numbers`);
  console.log(`Rows with no key at all        ${n(keyless)}`);
  console.log(`Keys shared by >1 row          ${n(sharedKeys.length)}`);
  console.log(`Rows involved in a shared key  ${n(rowsInShared)}`);
  console.log(`Unnumbered rows explained      ${n(rowsInShared - sharedKeys.length + keyless)}\n`);

  if (sharedKeys.length === 0) {
    console.log("No shared keys — every row has its own number.");
    process.exit(0);
  }

  // Classify each shared key by what actually differs between its rows.
  const cols = CSV_FIELDS.join(", ");
  let identical = 0;
  let pressingOnly = 0;
  let other = 0;
  const examples: { kind: string; key: string; detail: string }[] = [];
  const BATCH = 300;

  for (let i = 0; i < sharedKeys.length; i += BATCH) {
    const batch = sharedKeys.slice(i, i + BATCH).map((k) => k.key);
    const res = await client.execute({
      sql: `SELECT record_key, ${cols} FROM records
             WHERE record_key IN (${batch.map(() => "?").join(", ")})`,
      args: batch,
    });
    const byKey = new Map<string, Record<string, string | null>[]>();
    for (const raw of res.rows) {
      const row = raw as unknown as Record<string, string | null>;
      const k = String(row.record_key);
      const list = byKey.get(k);
      if (list) list.push(row);
      else byKey.set(k, [row]);
    }

    for (const [key, rows] of byKey) {
      const hashes = new Set(rows.map((r) => contentHashOf(r)));
      if (hashes.size === 1) {
        identical++;
        if (examples.filter((e) => e.kind === "identical").length < 3) {
          examples.push({ kind: "identical", key, detail: `${rows.length} identical rows` });
        }
        continue;
      }
      const differing = CSV_FIELDS.filter(
        (f) => new Set(rows.map((r) => (r[f] ?? "").trim().toLowerCase())).size > 1
      );
      const onlyPressing = differing.every((f) =>
        (PRESSING_FIELDS as readonly string[]).includes(f)
      );
      if (onlyPressing) {
        pressingOnly++;
        if (examples.filter((e) => e.kind === "pressing").length < 5) {
          const detail = PRESSING_FIELDS.map(
            (f) => `${f}: ${rows.map((r) => r[f] ?? "(blank)").join(" | ")}`
          ).join(",  ");
          examples.push({ kind: "pressing", key, detail });
        }
      } else {
        other++;
        if (examples.filter((e) => e.kind === "other").length < 5) {
          examples.push({ kind: "other", key, detail: `differs on: ${differing.join(", ")}` });
        }
      }
    }
  }

  console.log("What the shared keys actually are:");
  console.log(`  identical rows (true duplicates)            ${n(identical)}`);
  console.log(`  differ ONLY on country / format / year      ${n(pressingOnly)}   <- distinct pressings the key can't separate`);
  console.log(`  differ on something else                    ${n(other)}\n`);

  for (const kind of ["pressing", "other", "identical"]) {
    const list = examples.filter((e) => e.kind === kind);
    if (list.length === 0) continue;
    console.log(`Examples — ${kind}:`);
    for (const e of list) console.log(`  ${e.key}\n      ${e.detail}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
