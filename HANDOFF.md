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
- **Editors** — Andy Lambourn, David Diamant, Johan Lindgren, Brian Keyo. Correct
  records live on the site.
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

## Architecture — the four things that matter

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

**3. Editor overlay** (`lib/editor/overlay.ts`). Every upload rebuilds the catalogue
from Michael's spreadsheet, which would erase editor corrections. So overrides live in
tables *outside* the swap set, keyed by a **content-derived record key**
(`computeRecordKey`: matrix number, else label no + artist + title) because **row ids
are reassigned on every rebuild**. A **three-way merge** decides conflicts: each
override stores Michael's value at the time (`base_value`); if his upload still matches
that base the correction wins, if he changed it since his new value wins.
Deletions are tombstones. Full audit log in `modification_log`.

**4. SEO.** Per-record metadata, 4-chunk sitemap index, robots.txt that allows search
engines and blocks AI crawlers. 135k indexed pages is the moat vs Reggae Fever.

## URGENT — unresolved bug

**Michael uploaded tonight. It reported success and "a few hundred changes", but the
data isn't in the catalogue.** He asked whether renaming his Excel file caused it —
it didn't; the importer reads bytes and columns positionally, never the filename.

Already ruled out: both upload routes DO call `revalidateTag(CATALOGUE_TAG)`, so it
isn't stale caching.

Two suspects, in order:

1. **Legacy overrides silently beating his new values.** In the three-way merge, an
   override with `has_base = 0` (made before that column existed) **always wins**. If
   any editor had corrected a field he edited, his new value is discarded on import
   with no error. See `streamTargetRows` in `lib/import/importCsv.ts` and `has_base`
   in `lib/editor/overlay.ts`. Check `/admin/edits` for overrides on affected records.
2. **The resumable import reported success without completing.** Check `/admin` for
   row count and last-updated time; `/admin/history` has restore points.

**Tell him not to re-upload repeatedly** — if it's cause 1, each attempt discards his
work again.

## Open work

| Item | Notes |
|---|---|
| Bulk "revert all changes by this editor" on `/admin/edits` | Wanted before Markus gets a login. Confirmation with a count. Covers field overrides, created records, deletions. Data model already supports it — everything carries `editor_name`. |
| Rotate `ADMIN_PASSWORD` in Vercel | Oldest item. `/admin` is linked publicly in the footer. Current value is known in old chat logs. |
| Set `ADMIN_DISPLAY_NAME` = `Michael Turner` in Vercel | The bootstrap admin has no users row, so it's credited with whatever email he types at sign-in. |
| Vercel Firewall rate rule on `/records/*` | ~100 req/min per IP, action **Challenge** not Deny. The app-level crawl guard is a speed bump; this is real enforcement. |
| Six dropped Acknowledgements names | Roger Steffens and Penny Reel among them. Waiting on Michael. |
| Verdict on `/admin/matrix` | Michael has been lukewarm twice. If still noisy after the country/format/year fix, delete it rather than keep tuning. |

## Conventions

- **Branch:** `claude/rkr-site-repo-clarify-3p34o9`. Commit there, push, then
  `git checkout master && git merge --ff-only <branch> && git push origin master`.
  Vercel deploys from master.
- **Verify before shipping.** Write a throwaway `.mts` script in the repo root, point
  `TURSO_DATABASE_URL` at a local file DB, import fixture rows, assert, delete the
  script. Several real bugs were caught this way that reasoning missed.
- Always `npx tsc --noEmit` and `npm run build` before committing.
- Comments explain **why**, especially where a decision looks odd. That's the
  institutional memory across sessions — read them before changing anything.
- `AGENTS.md` warns this Next version differs from training data; read
  `node_modules/next/dist/docs/` before using an unfamiliar API. That caught a real
  behaviour change in `<Link prefetch>`.

## Gotchas that have already bitten

- **Row ids are not stable.** Full rebuilds renumber everything; the diff importer
  gives a *changed* record a new id. Never key anything durable on them — use
  `record_key`.
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
- `/admin` has **feature switches** (`lib/settings.ts`) so he can turn a misbehaving
  feature off himself without a deploy. Anything risky should get one.
