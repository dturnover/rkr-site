// Typo-tolerant name matching for "Did you mean…?".
//
// Pure functions, no database: lib/queries/nameSuggestions.ts loads the names
// and calls these. Kept separate so the matching can be tested on its own
// (scripts/test-fuzzy.ts).
//
// The measure is trigram similarity (Dice's coefficient over each string's
// three-letter pieces). It suits this catalogue better than plain edit
// distance: Jamaican artist and label names are spelled a dozen ways, and the
// usual slips — a doubled or dropped letter, a vowel swapped ("Isacs",
// "Dennis Browne", "Bob Marly") — leave most of a name's trigrams intact, while
// two genuinely different names share few.

/** Lowercase, accents stripped, punctuation to spaces, runs collapsed:
 * "U-Roy" and "u roy" compare equal, as do "Beverley's" and "Beverleys". */
export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The string's three-letter pieces, padded so the first and last letters
 * count as much as the middle ones — a typo in the first letter should cost
 * about what a typo anywhere else does. */
export function trigrams(normalized: string): Set<string> {
  const padded = `  ${normalized} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** 0 (nothing in common) to 1 (identical trigram sets). */
export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

export interface NameCandidate {
  /** As displayed, e.g. "Gregory Isaacs". */
  name: string;
  /** Which kind of name — artist, label… — so the suggestion can say so. */
  kind: string;
  /** How many records carry it. Breaks ties toward the name more people mean. */
  count: number;
}

export interface IndexedCandidate extends NameCandidate {
  norm: string;
  grams: Set<string>;
  /** Each word of three letters or more, for single-word queries. */
  words: { norm: string; grams: Set<string> }[];
}

export function indexCandidates(candidates: NameCandidate[]): IndexedCandidate[] {
  return candidates
    .map((c) => {
      const norm = normalizeName(c.name);
      return {
        ...c,
        norm,
        grams: trigrams(norm),
        words: norm
          .split(" ")
          .filter((w) => w.length >= 3)
          .map((w) => ({ norm: w, grams: trigrams(w) })),
      };
    })
    .filter((c) => c.norm.length > 0);
}

export interface Suggestion extends NameCandidate {
  score: number;
}

// Below this a match is more likely a different name than a misspelling.
// Tuned against the cases in scripts/test-fuzzy.ts: real slips score 0.6–0.9,
// unrelated names under 0.45.
const MIN_SCORE = 0.55;

// A one-word query matched against one word of a longer name ("marly" against
// "Bob Marley") is slightly weaker evidence than a whole-name match, so it's
// discounted a little and loses ties to one.
const WORD_MATCH_WEIGHT = 0.95;

/** The closest names to `query`, best first. Empty when nothing is close
 * enough — a wrong suggestion in a reference work is worse than none. */
export function suggestNames(
  query: string,
  candidates: IndexedCandidate[],
  limit = 3
): Suggestion[] {
  const q = normalizeName(query);
  if (q.length < 3) return [];
  const qGrams = trigrams(q);
  const singleWord = !q.includes(" ");
  // Generous, but enough to skip comparing a 5-letter query with 40-letter names.
  const maxLenGap = Math.max(4, Math.ceil(q.length * 0.6));

  const scored: Suggestion[] = [];
  for (const c of candidates) {
    if (c.norm === q) continue; // an exact name would have been found already
    let score = 0;
    if (Math.abs(c.norm.length - q.length) <= maxLenGap) score = dice(qGrams, c.grams);
    if (singleWord) {
      for (const w of c.words) {
        if (w.norm === q) continue;
        if (Math.abs(w.norm.length - q.length) > maxLenGap) continue;
        score = Math.max(score, dice(qGrams, w.grams) * WORD_MATCH_WEIGHT);
      }
    }
    if (score >= MIN_SCORE) scored.push({ name: c.name, kind: c.kind, count: c.count, score });
  }

  scored.sort((a, b) => b.score - a.score || b.count - a.count);
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of scored) {
    const key = `${s.kind}:${normalizeName(s.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
