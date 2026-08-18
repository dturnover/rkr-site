import { getClient } from "@/lib/db/client";

// Switches an admin can throw WITHOUT a deploy.
//
// The site is maintained by one developer who isn't always reachable. If a
// feature starts misbehaving in a way that only shows up against the real
// catalogue, the compiler needs to be able to turn it off himself, from the
// admin page, immediately — not wait for someone to push a fix. Anything
// risky enough to want that gets a switch here.
//
// Values live in the database rather than an environment variable so that
// flipping one takes effect on every running instance at once, with no
// redeploy and nothing to configure in Vercel.

export const FLAG_RELEASE_GROUPING = "release_grouping";
export const FLAG_RECORD_NUMBERS = "record_numbers";

/** Every switch, with the default applied when it has never been set, and the
 * wording the admin page shows. Defaults are ON: a switch exists to turn a
 * shipped feature OFF, so a database that has never heard of it must behave
 * exactly as it did before the switch was added. */
export const FLAGS: Record<
  string,
  { label: string; description: string; whenOff: string; default: boolean }
> = {
  [FLAG_RELEASE_GROUPING]: {
    label: "Combined track listings",
    description:
      "On a 12\" or EP, shows the record's full contents by gathering the other entries that share its label number.",
    whenOff:
      "Each entry shows only its own two sides again, exactly as the site worked before this was added.",
    default: true,
  },
  [FLAG_RECORD_NUMBERS]: {
    label: "Catalogue numbers",
    description:
      "Shows a permanent RKR number on each entry, so a reader can quote one entry precisely. /records/RKR-000123 also opens that entry.",
    whenOff:
      "Entries show no catalogue number and an RKR-000123 address stops resolving. Numbers already handed out are kept, not discarded, so turning this back on restores the same numbers.",
    default: true,
  },
};

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS site_settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

// Read once every few seconds per instance rather than on every page view —
// a switch that is almost never touched shouldn't cost a query per request.
const CACHE_MS = 15_000;
let cache = new Map<string, boolean>();
let cachedAt = 0;

async function loadAll(): Promise<Map<string, boolean>> {
  const now = Date.now();
  if (now - cachedAt < CACHE_MS && cache.size > 0) return cache;
  await ensureTable();
  const client = await getClient();
  const res = await client.execute(`SELECT key, value FROM site_settings`);
  const next = new Map<string, boolean>();
  for (const key of Object.keys(FLAGS)) next.set(key, FLAGS[key].default);
  for (const r of res.rows) {
    const rr = r as unknown as { key: string; value: string };
    next.set(String(rr.key), String(rr.value) === "on");
  }
  cache = next;
  cachedAt = now;
  return cache;
}

/** Whether a feature is switched on. Falls back to the shipped default if the
 * settings table can't be read, so a database hiccup can't be what turns a
 * working feature off — or, worse, leave it stuck on. */
export async function isEnabled(key: string): Promise<boolean> {
  try {
    return (await loadAll()).get(key) ?? FLAGS[key]?.default ?? true;
  } catch {
    return FLAGS[key]?.default ?? true;
  }
}

export async function getAllFlags(): Promise<Record<string, boolean>> {
  const map = await loadAll().catch(() => new Map<string, boolean>());
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(FLAGS)) out[key] = map.get(key) ?? FLAGS[key].default;
  return out;
}

export async function setFlag(key: string, on: boolean, who: string): Promise<void> {
  if (!FLAGS[key]) return;
  await ensureTable();
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO site_settings (key, value, updated_at, updated_by)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value, updated_at = excluded.updated_at,
            updated_by = excluded.updated_by`,
    args: [key, on ? "on" : "off", new Date().toISOString(), who],
  });
  cachedAt = 0; // take effect on the next request, everywhere
}
