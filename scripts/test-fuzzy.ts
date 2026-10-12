// Checks the "Did you mean…?" matching (lib/fuzzy.ts) against the kinds of
// slips people actually make with Jamaican artist and label names — and that
// unrelated queries get NO suggestion, since a wrong one is worse than none.
//
//   npm run test:fuzzy

import { indexCandidates, suggestNames, type NameCandidate } from "../lib/fuzzy";

const ARTISTS = [
  ["Gregory Isaacs", 2431], ["Dennis Brown", 2210], ["Bob Marley", 1500], ["Rita Marley", 120],
  ["Ziggy Marley", 90], ["Bob Andy", 300], ["Desmond Dekker", 400], ["Alton Ellis", 900],
  ["Augustus Pablo", 500], ["Freddie McGregor", 700], ["Burning Spear", 450], ["Lee 'Scratch' Perry", 800],
  ["U-Roy", 350], ["U Brown", 200], ["I-Roy", 300], ["Prince Buster", 600], ["John Holt", 1100],
  ["Horace Andy", 650], ["Barrington Levy", 550], ["Sugar Minott", 750], ["Big Youth", 400],
  ["Johnny Clarke", 500], ["Cornell Campbell", 450], ["Al Campbell", 300], ["Ken Boothe", 600],
  ["Delroy Wilson", 700], ["Errol Dunkley", 250], ["Tapper Zukie", 200], ["Max Romeo", 350],
  ["Junior Murvin", 150], ["Junior Byles", 200], ["Jacob Miller", 300], ["Al Brown", 150],
  ["Errol Brown", 100], ["Toots & The Maytals", 500], ["The Maytals", 300], ["Laurel Aitken", 400],
  ["Derrick Morgan", 650], ["Jimmy Cliff", 300], ["Owen Gray", 450], ["Dillinger", 250],
] as const;
const LABELS = [
  ["Studio One", 9000], ["Treasure Isle", 3000], ["Beverley's", 1500], ["Black Ark", 800],
  ["Joe Gibbs", 1200], ["Channel One", 1100], ["Greensleeves", 2500], ["Trojan", 4000],
] as const;

const candidates: NameCandidate[] = [
  ...ARTISTS.map(([name, count]) => ({ name, count, kind: "artist" })),
  ...LABELS.map(([name, count]) => ({ name, count, kind: "label" })),
];
const index = indexCandidates(candidates);

// [query, expected first suggestion, or null for "suggest nothing"]
const CASES: [string, string | null][] = [
  ["gregory isacs", "Gregory Isaacs"],
  ["Gregory Isaac", "Gregory Isaacs"],
  ["isacs", "Gregory Isaacs"],
  ["dennis browne", "Dennis Brown"],
  ["denis brown", "Dennis Brown"],
  ["bob marly", "Bob Marley"],
  ["marly", "Bob Marley"],
  ["desmond decker", "Desmond Dekker"],
  ["augustus pablos", "Augustus Pablo"],
  ["freddy mcgregor", "Freddie McGregor"],
  ["alton elis", "Alton Ellis"],
  ["burning spears", "Burning Spear"],
  ["barrington levi", "Barrington Levy"],
  ["sugar minot", "Sugar Minott"],
  ["tappa zukie", "Tapper Zukie"],
  ["studio 1", "Studio One"],
  ["treasure island", "Treasure Isle"],
  ["beverleys", null], // normalises to "Beverley's" exactly — the search finds it itself
  ["greensleves", "Greensleeves"],
  ["xylophone", null],
  ["zzz", null],
  ["love", null],
  ["the", null],
  ["pressure drop", null],
];

let failures = 0;
for (const [query, expected] of CASES) {
  const got = suggestNames(query, index);
  const first = got[0]?.name ?? null;
  const ok = first === expected;
  if (!ok) failures++;
  const detail = got.map((s) => `${s.name} ${s.score.toFixed(2)}`).join(", ") || "—";
  console.log(`${ok ? "ok  " : "FAIL"}  ${query.padEnd(18)} -> ${String(first).padEnd(16)} [${detail}]`);
}

if (failures) {
  console.error(`\n${failures} of ${CASES.length} failed`);
  process.exit(1);
}
console.log(`\nall ${CASES.length} cases pass`);
