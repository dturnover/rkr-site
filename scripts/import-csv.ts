import fs from "node:fs";
import path from "node:path";
import { importAndSwap } from "../lib/import/atomicSwap";
import { DB_PATH } from "../lib/db/client";

function parseArgs() {
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  if (!fileArg) {
    console.error('Usage: npm run import -- --file="path/to/RKR.csv"');
    process.exit(1);
  }
  return path.resolve(fileArg.slice("--file=".length).replace(/^["']|["']$/g, ""));
}

async function main() {
  const csvPath = parseArgs();
  console.log(`Reading ${csvPath} ...`);
  const buffer = fs.readFileSync(csvPath);

  const target = process.env.TURSO_DATABASE_URL
    ? `Turso database at ${process.env.TURSO_DATABASE_URL}`
    : `local database at ${DB_PATH}`;
  console.log(`Building ${target} ...`);
  const result = await importAndSwap(buffer);

  console.log(`Imported ${result.rowCount.toLocaleString()} rows.`);
  if (result.previousRowCount != null) {
    console.log(`Previous version had ${result.previousRowCount.toLocaleString()} rows.`);
  }
  if (result.lowRowCountWarning) {
    console.warn(
      "WARNING: new row count is less than 50% of the previous import. Double-check the source file."
    );
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
