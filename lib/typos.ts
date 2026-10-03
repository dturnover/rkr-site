import { unstable_cache } from "next/cache";
import { getClient } from "@/lib/db/client";
import { CATALOGUE_TAG, TYPOS_TAG } from "@/lib/cacheTags";
import type { EditableField } from "@/lib/editor/overlay";

// Typo detection is limited to the BOUNDED, categorical fields — the ones whose
// facets are `singlePage` in facetConfig (a fixed real-world taxonomy, not
// per-record free text). Detection is deliberately HIGH-PRECISION: it only
// surfaces changes that are safe to apply, because the admin applies them in
// bulk with one click. Two sources, no fuzzy guessing:
//   1. Formatting duplicates — the same value written inconsistently (case,
//      spacing, punctuation): "dancehall"/"Dancehall", "R&B from USA"/
//      "R & B from USA", "12 EP"/"12 (EP)". Canonical = the most common form.
//   2. A short curated list of real misspellings seen in the data where there
//      is no correct counterpart to merge into ("Scandanavia" -> "Scandinavia").
// It deliberately does NOT do edit-distance near-miss matching: on this data
// that flagged valid distinct values as typos (10-inch vs 12-inch records,
// "Pop from UK" vs "Pop from USA", "USA & JA" vs "USA & UK") and even suggested
// changing a correct spelling into a more-common misspelling. Broader,
// judgement-call corrections (artists, titles) belong in a reviewed export.
export const TYPO_FIELDS = ["country", "format", "genre"] as const;
export type TypoField = (typeof TYPO_FIELDS)[number];

export interface TypoSuggestion {
  field: TypoField;
  current: string;
  currentCount: number;
  suggested: string;
  suggestedCount: number;
  // kind is informational for the UI badge.
  kind: "formatting" | "spelling";
}

// Curated misspellings observed in the catalogue whose correct spelling has no
// (or too few) existing rows to merge into automatically. Add to this list as
// new ones surface from an export review.
const CURATED: Record<TypoField, Record<string, string>> = {
  country: {
    Scandanavia: "Scandinavia",
    Guatamala: "Guatemala",
    Phillipines: "Philippines",
    "New Zealnd": "New Zealand",
    "Suth Africa": "South Africa",
    Mrxico: "Mexico",
    Perus: "Peru",
  },
  format: {},
  genre: {
    "Caltpso // Traditional": "Calypso // Traditional",
    "Drum N Base": "Drum N Bass",
  },
};

// Collapse to a comparison key: two values sharing a key are the same value
// written with different case, spacing or punctuation.
function keyOf(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const dismissKey = (field: string, value: string) => `${field} ${value}`;

let ensured: Promise<void> | null = null;
function ensureDismissTable(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      const client = await getClient();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS dismissed_typos (
          field TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (field, value)
        )
      `);
    })().catch((err) => {
      ensured = null;
      throw err;
    });
  }
  return ensured;
}

async function getDismissed(): Promise<Set<string>> {
  await ensureDismissTable();
  const client = await getClient();
  const res = await client.execute(`SELECT field, value FROM dismissed_typos`);
  return new Set(res.rows.map((r) => dismissKey(String(r.field), String(r.value))));
}

/** Records a suggestion the admin has chosen to ignore, so it stops appearing. */
export async function dismissTypo(field: string, value: string): Promise<void> {
  await ensureDismissTable();
  const client = await getClient();
  await client.execute({
    sql: `INSERT OR IGNORE INTO dismissed_typos (field, value) VALUES (?, ?)`,
    args: [field, value],
  });
}

async function detectTyposUncached(): Promise<TypoSuggestion[]> {
  const client = await getClient();
  const dismissed = await getDismissed();
  const out: TypoSuggestion[] = [];

  for (const field of TYPO_FIELDS) {
    let rows: { v: string; c: number }[];
    try {
      const res = await client.execute(
        `SELECT ${field} AS v, COUNT(*) AS c
         FROM records
         WHERE ${field} IS NOT NULL AND TRIM(${field}) <> ''
         GROUP BY ${field}`
      );
      rows = res.rows as unknown as { v: string; c: number }[];
    } catch {
      continue; // no catalogue yet / column missing
    }

    const values = rows.map((r) => ({ value: String(r.v), count: Number(r.c) }));
    const countOf = new Map(values.map((x) => [x.value, x.count]));
    const handled = new Set<string>();

    // 1) Formatting duplicates (case / spacing / punctuation).
    const groups = new Map<string, { value: string; count: number }[]>();
    for (const item of values) {
      if (item.value.trim().endsWith("?")) continue; // deliberate uncertainty marker
      const k = keyOf(item.value);
      if (!k) continue;
      const arr = groups.get(k);
      if (arr) arr.push(item);
      else groups.set(k, [item]);
    }
    for (const items of groups.values()) {
      if (items.length < 2) continue;
      items.sort((a, b) => b.count - a.count);
      const canon = items[0];
      for (const it of items.slice(1)) {
        if (it.value === canon.value) continue;
        handled.add(it.value);
        if (dismissed.has(dismissKey(field, it.value))) continue;
        out.push({
          field,
          current: it.value,
          currentCount: it.count,
          suggested: canon.value,
          suggestedCount: canon.count,
          kind: "formatting",
        });
      }
    }

    // 2) Curated spelling fixes.
    for (const [wrong, right] of Object.entries(CURATED[field])) {
      if (!countOf.has(wrong) || handled.has(wrong)) continue;
      handled.add(wrong);
      if (dismissed.has(dismissKey(field, wrong))) continue;
      out.push({
        field,
        current: wrong,
        currentCount: countOf.get(wrong)!,
        suggested: right,
        suggestedCount: countOf.get(right) ?? 0,
        kind: "spelling",
      });
    }
  }

  out.sort((a, b) => a.field.localeCompare(b.field) || a.currentCount - b.currentCount);
  return out;
}

// Two tags. CATALOGUE_TAG so any edit or import that changes the values
// refreshes the list; TYPOS_TAG so a dismissal can refresh JUST this list.
// Dismissing used to flush the catalogue tag and the whole record route, which
// threw away every cached record page in the site over a change that touches
// no record at all.
export const detectTypos = unstable_cache(detectTyposUncached, ["typo-suggestions"], {
  tags: [CATALOGUE_TAG, TYPOS_TAG],
  revalidate: 3600,
});

/** Applies a categorical correction to every record currently holding
 * `current` in `field`, via the shared per-record edit path (so each change is
 * logged, indexed, and survives re-import). Returns how many fields changed and
 * which records they were on — the ids are what lets the caller drop just
 * those record pages from the cache rather than all 135k. */
export async function applyCategoryCorrection(
  field: TypoField,
  current: string,
  suggested: string,
  editor: { uid: number | "env-admin"; name: string }
): Promise<{ changed: number; ids: number[] }> {
  const { applyFieldEdits } = await import("@/lib/editor/overlay");
  const client = await getClient();
  const res = await client.execute({
    sql: `SELECT id FROM records WHERE ${field} = ?`,
    args: [current],
  });
  let changed = 0;
  const ids: number[] = [];
  for (const row of res.rows) {
    const id = Number((row as unknown as { id: number }).id);
    const n = await applyFieldEdits(
      id,
      { [field]: suggested } as Partial<Record<EditableField, string | null>>,
      editor
    );
    changed += n;
    if (n > 0) ids.push(id);
  }
  return { changed, ids };
}
