import path from "node:path";
import fs from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const DATA_DIR = path.resolve(process.cwd(), "data");

export const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(DATA_DIR, "rkr.db");

function ensureDataDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// Cached on globalThis so Next.js dev-mode module reloading (fast refresh)
// never opens a second handle on the same SQLite file/connection.
type DbGlobal = { rkrClient?: Client; rkrClientReady?: Promise<void> };
const g = globalThis as unknown as DbGlobal;

/** Resolves once the connection is open and (for local files) WAL mode is
 * confirmed active. Local SQLite's default rollback-journal mode locks the
 * whole file during any write transaction, so a page load hitting the DB
 * while an admin import is running would fail with SQLITE_BUSY (confirmed
 * by testing) — WAL mode lets readers see a consistent snapshot without
 * blocking on a concurrent writer. Every call site awaits this via
 * getClient() below, so no query can run before it's set. */
export async function getClient(): Promise<Client> {
  if (!g.rkrClient) {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    if (tursoUrl) {
      g.rkrClient = createClient({
        url: tursoUrl,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      g.rkrClientReady = Promise.resolve();
    } else {
      ensureDataDir();
      g.rkrClient = createClient({ url: `file:${DB_PATH}` });
      g.rkrClientReady = g.rkrClient.execute("PRAGMA journal_mode=WAL;").then(() => {});
    }
  }
  await g.rkrClientReady;
  return g.rkrClient;
}

export async function getDb() {
  return drizzle(await getClient(), { schema });
}
