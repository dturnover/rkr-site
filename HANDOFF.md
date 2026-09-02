# RKR — Handoff

Paste this into a new session. It assumes no prior knowledge.

## The project

**Repo:** `dturnover/rkr-site` — working dir `/home/user/rkr-site`
**Live:** https://rootsknottyroots.org (also reachable at `rkr-site.vercel.app`)
**What it is:** a free, public discography of Jamaican music — **135,543 records**,
1953–1999. Replaces a subscription site.

**People:**
- **Desmond Turner** — the user you're talking to. Sole developer.
- **Michael Turner** ("dad", "Old Broom", `oldbroom1@gmail.com`) — his father. Compiled
  the discography over 35 years. Maintains it in **Excel**, uploads weekly. Site admin.
- **Editors** — Andy Lambourn, David Diamant, Johan Lindgren, Brian Keyo, Phil Etgart.
  Correct records live on the site. (Phil is credited but has no account yet.)
- **Markus Vogel / Reggae Fever** (reggaefever.ch) — ran the previous subscription
  version, in partnership with Michael. Relations are strained; there is an ongoing
  dispute about the old site still hosting Michael's work. Their site is now free but
  still behind a login, so Google can't index its catalogue — that's RKR's main
  strategic advantage. Markus has asked for an editor login on RKR; undecided.

## Stack

Next.js 16.2 (App Router, RSC), React 19, TypeScript 5 strict, Tailwind 4.
**Turso/libSQL** via `@libsql/client`. Deployed on **Vercel** (Pro, Fluid compute),
with Vercel Blob for large uploads, Analytics, Speed Insights. **Resend** for email.
~11.6k lines across ~100 files. Essentially **zero client-side JavaScript** — search,
browse, sort, editing and admin are all server-rendered HTML forms. Keep it that way.

## Architecture — the five things that matter

**1. Search.** Two FTS5 indexes: a word-tokenized one (`records_fts`) and a
**trigram** one (`records_catalog_fts`) for substring matching across 19 columns.
Both are standalone (no `content=` link) because the import swap renames tables and
an external-content link would dangle. Eight `_norm` columns are precomputed in JS at
import. This replaced `LIKE '%x%'` scans measured at **40–100+ seconds** per query.

**2. Import** (`lib/import/`). Michael uploads Excel/CSV → browser uploads straight to
Vercel Blob (4.5MB request limit) → server streams it. Streaming generators keep memory
~200MB. Diff import via SHA-1 content hashes; **resumable** across the 300s function
limit (210s apply budget per pass); atomic table swap with the previous generation kept
for rollback; 10-deep import history.

**3. Editor overlay** (`lib/editor/overlay.ts`). A `null` override value means the
editor deliberately CLEARED the field and is applied like any other correction — the
merge skipped nulls for a long time, which silently undid every clear on the next
upload. See `scripts/test-cleared-fields.ts`. Every upload rebuilds the catalogue
from Michael's spreadsheet, which would erase editor corrections. So overrides live in
tables *outside* the swap set, keyed by a **content-derived record key**
(`computeRecordKey`: matrix number, else label no + artist + title) because **row ids
are reassigned on every rebuild**. A **three-way merge** decides conflicts: each
override stores Michael's value at the time (`base_value`); if his upload still matches
that base the correction wins, if he changed it since his new value wins.
Deletions are tombstones. Full audit log in `modification_log`.

**4. SEO.** Per-record metadata, 4-chunk sitemap index, robots.txt that allows search
engines and blocks AI crawlers. 135k indexed pages is the moat vs Reggae Fever.

**5. Catalogue numbers** (`lib/recordNumbers.ts`). "RKR-000123", displayed on each
entry and resolvable at `/records/RKR-000123`. Filed against `record_key` in a table
**outside the swap set**, assigned once, never reused or reassigned. The row id could
not do this job: the diff importer applies a correction as delete-old + insert-new, so
a record's id changes *precisely when the record is corrected* — the one moment someone
is likely to be quoting it. The row id stays canonical; only ~0.3% of ids move per
upload, and repointing 135k indexed URLs is a separate decision, not a side effect.

## Last session

**The upload bug in the previous handoff was not a bug.** The compiler reported an
upload that "said success, a few hundred changes" but whose data he couldn't see.
Both suspects were investigated and neither fired — he followed up the next
morning with "Btw the file did upload. I couldn't see it last night." Nothing was
changed on that account. For the record, the two suspects were also narrowed while
looking:

- The resumable importer is close to exonerated by construction: `BlobUploadForm`
  only shows success on a `done` event with `complete !== false`, and resumes on
  `incomplete`, on `cutoff`, and on transport errors up to 100 passes. A truncated
  import surfaces as a visible error, not as success.
- `has_base = 0` overrides ("legacy edit always wins") are rarer than that handoff
  implied. `setFieldEdit` is the only writer of `editor_field_edits`, has always
  written `has_base = 1` and a `modification_log` row in the same batch, and the
  migration in `ensureOverlayTables` promotes any legacy edit that has a log entry.
  The live risk is the *designed* half: an override with `has_base = 1` still wins
  whenever the compiler's uploaded value still equals the stored base.

**Shipped since:** permanent catalogue numbers, the browse lists capped at three
columns, Phil Etgart added to the contributing editors, the B-side shortcut for
editors, a rendered-space fix on `/admin/edits`, and the modification-log record
column below.

**The modification log's record column** was showing raw row ids, and the compiler
reported two faults in one go: entries with no number at all ("I can't find it or go
to it"), and numbers that led to the wrong record. Both are the same root cause and
both are fixed:

- **Dashes.** `computeRecordKey` is derived from the record's content, so an editor
  correcting a *matrix number* — or a label number / artist / title on a record with
  no matrix number — changes the record's identity. `setFieldEdit` pins the original
  key on the row, which holds only until the compiler makes the same correction in
  his spreadsheet; from that upload on the record is rebuilt under its new key and
  every log entry filed under the old one dangles. Reproduced against a fixture
  before fixing. The log entry records the very change that moved the key, so
  `movedKeyFor` rebuilds the new key **from the recorded old → new value** rather
  than guessing, requires exactly one record to answer to it, and then applies the
  recovered record to every other entry sharing that old key — so the record's
  earlier history comes back with it.
- **Wrong numbers.** The column now shows the permanent catalogue number and links
  through `/records/RKR-000123`. A row id is not a name: it changes whenever the
  record is corrected, so a number copied out of that list stopped meaning anything.
  The row id remains a fallback for a record not yet numbered.

**One thing to do after that deploy:** press **Assign missing numbers** on `/admin`
once. Catalogue numbers are handed out at the end of every import, so without an
upload due, the first population needs that button. It is idempotent — pressing it
twice is safe, and it reports how many it assigned.

## Open work

| Item | Notes |
|---|---|
| Catalogue-number relink after a matrix change | **Deferred deliberately, twice — read this before building it.** `computeRecordKey` is derived from the matrix number when there is one, so when the compiler edits a matrix number the record becomes a different record here: it draws a fresh number and the old one 404s. A heuristic to carry the number across was designed (match only *retired* numbers, strict 1-to-1 on artist/title/label/label-number/country/format/year, ambiguity → assign fresh) and judged sound, then not built — the value today is zero because nobody has quoted a number yet, while a citable number silently pointing at the wrong record is the worst failure a reference work has. Revisit once numbers are actually in circulation. |
| `identity` column on `record_numbers` | The cheap half of the row above, also not built. Storing a normalized artist/title/label/label-number/country/format/year fingerprint at assignment costs nothing and involves no inference — but without it, any number orphaned between now and whenever relinking is revisited is **permanently** unrelinkable, because once the record leaves `records` the evidence goes with it. Worth doing early if relinking is ever likely. |
| Canonical URLs on catalogue numbers | `/records/RKR-000123` resolves but the row id is still canonical and still what the sitemap emits. Switching would give permanently stable indexed URLs, at the cost of re-indexing 135k pages. A real option, deliberately not taken in passing. |
| Bulk "revert all changes by this editor" on `/admin/edits` | Wanted before Markus gets a login. Confirmation with a count. Covers field overrides, created records, deletions. Data model already supports it — everything carries `editor_name`. |
| Rotate `ADMIN_PASSWORD` in Vercel | **Oldest item, and now the most overdue.** `/admin` is linked publicly in the footer and the current value is known in old chat logs. |
| Set `ADMIN_DISPLAY_NAME` = `Michael Turner` in Vercel | The bootstrap admin has no users row, so it's credited with whatever email he types at sign-in. |
| Vercel Firewall rate rule on `/records/*` | ~100 req/min per IP, action **Challenge** not Deny. The app-level crawl guard is a speed bump; this is real enforcement. |
| Six dropped Acknowledgements names | Roger Steffens and Penny Reel among them. Waiting on Michael. (Phil Etgart is done — he was already in the contributor list, just not on the editors line.) |
| Catalogue number changes when a matrix number does | Same root cause as the log dashes above, still unfixed for *numbers*: correcting a matrix number moves the record's key, so it draws a fresh catalogue number and the old one 404s. The log now recovers from this; the numbers do not. See the two deferred rows above. |
| Editor login for Phil Etgart | He is credited as a contributing editor now, but has no account. Needs his email; Michael can send the invite himself from `/admin`. Unclear whether he wants one. |
| Verdict on `/admin/matrix` | Michael has been lukewarm twice. If still noisy after the country/format/year fix, delete it rather than keep tuning. |

## Conventions

- **Branch:** `claude/rkr-site-repo-clarify-3p34o9`. Commit there, push, then
  `git checkout master && git merge --ff-only <branch> && git push origin master`.
  Vercel deploys from master.
- **Repo:** `dturnover/rkr-site`. A session started against
  `dturnover/Roots-Knotty-Roots` instead — that is a different, older FastAPI +
  Vite prototype, not this site. If the working directory has a `backend/` folder
  and a notebook in it, you are in the wrong repository.
- **Verify before shipping.** Write a throwaway `.mts` script in the repo root, point
  `TURSO_DATABASE_URL` at a local file DB, import fixture rows, assert, delete the
  script. Several real bugs were caught this way that reasoning missed.
- Always `npx tsc --noEmit` and `npm run build` before committing. **A scratch
  `.mts`/`.ts` file left in the repo root fails the build** — `next build` type-checks
  it along with everything else, and `"./lib/x.ts"`-style imports in a scratch script
  are exactly what it rejects. Keep throwaway scripts outside the repo, or delete them
  before building.
- Three retained test suites: `npm run test:bside-entry` (14), `npm run test:moved-key`
  (18) and `npm run test:cleared-fields` (6). The first two cover **derived** data where
  being confidently wrong is worse than declining to answer; the third pins down that a
  field cleared on the site stays cleared. They pin down what the strictness buys, so it
  isn't loosened later by someone who only notices it costs matches. There is no test
  runner otherwise — everything else is verified with a throwaway script and deleted.
- Comments explain **why**, especially where a decision looks odd. That's the
  institutional memory across sessions — read them before changing anything.
- `AGENTS.md` warns this Next version differs from training data; read
  `node_modules/next/dist/docs/` before using an unfamiliar API. That caught a real
  behaviour change in `<Link prefetch>`.

## Gotchas that have already bitten

- **Row ids are not stable.** Full rebuilds renumber everything; the diff importer
  gives a *changed* record a new id. Never key anything durable on them — use
  `record_key`. Never *show* one as a name either: the compiler reported exactly this
  on the modification log, having written a number down and found it led elsewhere.
  Show the catalogue number (`lib/recordNumbers.ts`).
- **`record_key` is not stable either, and this keeps biting.** It is derived from the
  matrix number (else label no + artist + title), so correcting any of those makes the
  record a *different* record to every table keyed on it — the overlay, the
  modification log, the catalogue numbers. Three separate bugs have now traced back
  here. Anything durable keyed on `record_key` needs a story for what happens when it
  moves.
- **SQLite renames tables but not indexes.** After a swap, an index name can still
  exist attached to `records_previous`. `CREATE INDEX IF NOT EXISTS` then silently
  does nothing. Check `PRAGMA index_list(records)`.
- **`prefetch={false}` disables hover prefetching too** in the App Router. It's on for
  the sidebar and letter tabs, off for the 100-link result lists.
- **Never rate-limit Googlebot.** `lib/crawlGuard.ts` exempts search engines before
  counting and fails open. Indexing is the whole competitive advantage.
- **Michael's data is inconsistent by his own account** — partial matrix numbers in the
  B-side column, stubs not always matched to a song's own entry. Any feature that
  infers relationships must fail toward showing nothing rather than showing something
  wrong. A wrong grouping in a reference work is worse than a missing one.
- The B-side has only 6 columns (artist, credit, title, title credit, matrix no,
  label no) and **cannot gain more** without changing his spreadsheet. A flip side
  needing its own producer/riddim/genre gets its own entry instead.
- **JSX strips the leading space of a text node that continues onto the next line.**
  `<strong>Base</strong> is dad's value when…` wrapping across two source lines rendered
  as "Baseis" on `/admin/edits` — correct in the source, wrong on screen, and invisible
  to lint, tsc and the build. Fixed with an explicit `{" "}`. Worth a glance at any
  inline `<strong>`/`<em>` whose sentence wraps.
- `/admin` has **feature switches** (`lib/settings.ts`) so he can turn a misbehaving
  feature off himself without a deploy. Anything risky should get one. Currently:
  combined track listings, catalogue numbers, and the B-side shortcut for editors.
