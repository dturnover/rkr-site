/**
 * Rebuilds the `records_catalog_fts` trigram index in place from the existing
 * `records` table — no CSV re-import needed.
 *
 * Why this exists: B-side columns were added to CATALOG_FTS_COLUMNS
 * (lib/db/ddl.ts) so that B-side artists, titles, and catalogue numbers become
 * searchable. All of that data was ALREADY imported into `records`; only the
 * search index omitted it. So rather than make dad re-upload the 132k-row CSV,
 * this script drops and recreates just the FTS table and repopulates it from
 * the base table that already holds every value.
 *
 * Runs against whatever database lib/db/client picks by env: the local file by
 * default, or the live Turso database when TURSO_DATABASE_URL is set. The whole
 * drop/create/populate runs as ONE libSQL batch (a single write transaction),
 * so concurrent readers keep seeing the old index until the new one commits —
 * no window where search returns nothing.
 *
 * Usage:
 *   npm run rebuild-catalog-fts                 # local data/rkr.db
 *   (with Turso env vars set)                   # live database
 */
import { getClient } from "../lib/db/client";
import { CATALOG_FTS_COLUMNS } from "../lib/db/ddl";
import { CATALOG_FTS_SOURCE_EXPR } from "../lib/import/importCsv";

const LIVE = "records";
const FTS = "records_catalog_fts";

async function main() {
  const client = await getClient();

  const before = await client.execute(`SELECT COUNT(*) AS c FROM ${LIVE}`);
  const recordCount = Number(before.rows[0]?.c ?? 0);
  console.log(`records table: ${recordCount.toLocaleString()} rows`);
  if (recordCount === 0) {
    console.error("No rows in `records` — nothing to index. Aborting.");
    process.exit(1);
  }

  const cols = CATALOG_FTS_COLUMNS.join(", ");
  const exprs = CATALOG_FTS_COLUMNS.map((c) => CATALOG_FTS_SOURCE_EXPR[c]).join(", ");

  console.log(`Rebuilding ${FTS} over ${CATALOG_FTS_COLUMNS.length} columns…`);
  console.log(`  columns: ${cols}`);

  const t0 = Date.now();
  await client.batch(
    [
      `DROP TABLE IF EXISTS ${FTS}`,
      `CREATE VIRTUAL TABLE ${FTS} USING fts5(${cols}, tokenize='trigram')`,
      `INSERT INTO ${FTS}(rowid, ${cols}) SELECT id, ${exprs} FROM ${LIVE}`,
    ],
    "write"
  );
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // Sanity: does a B-side value now match? Pick a real one from the data.
  const sample = await client.execute(
    `SELECT b_side_artist FROM ${LIVE}
     WHERE b_side_artist IS NOT NULL AND length(b_side_artist) >= 3
     LIMIT 1`
  );
  const bSideArtist = sample.rows[0]?.b_side_artist as string | undefined;
  let verified = "skipped (no B-side artist ≥3 chars found)";
  if (bSideArtist) {
    const term = bSideArtist.toLowerCase().slice(0, 8).replace(/"/g, '""');
    const hit = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM ${FTS} WHERE ${FTS} MATCH ?`,
      args: [`b_side_artist:"${term}"`],
    });
    verified = `b_side_artist:"${term}" -> ${Number(hit.rows[0]?.c ?? 0)} match(es)`;
  }

  console.log(`\nDone in ${secs}s.`);
  console.log(`Verify: ${verified}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Rebuild failed:", err);
    process.exit(1);
  });
