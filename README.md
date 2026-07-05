# Roots Knotty Roots

A free, searchable discography of Jamaican music — ska, rocksteady, reggae, dancehall and more — rebuilt as a public site so it no longer sits behind a paywall.

- Search, advanced search, and browsing by artist/country/year/format/label/producer/riddim/genre/origin
- Track detail pages with A-side/B-side
- A password-protected `/admin` page for uploading a new version of the dataset — replaces the live catalogue with zero downtime, with one-click rollback

## Stack

Next.js (App Router) + TypeScript + Tailwind, with `@libsql/client` as the data layer — the same client works against a local SQLite file (`./data/rkr.db`) in development and a remote [Turso](https://turso.tech) database in production, so there's no driver swap at deploy time.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # then fill in ADMIN_PASSWORD and ADMIN_COOKIE_SECRET
npm run import -- --file="path/to/RKR.csv"
npm run dev
```

The importer expects the CSV in the exact column order documented in `lib/import/importCsv.ts` (`CSV_FIELDS`) — this matches the export format used throughout the project.

## How data updates work

The admin (`/admin`) uploads a new CSV. The importer builds the new dataset into `records_new`/`records_new_fts` tables, then a single SQL transaction renames the live tables to `records_previous`/`records_previous_fts` and the staging tables into place — the site keeps serving the old data until the instant the swap commits, and "Restore Previous" can undo it. See `lib/import/atomicSwap.ts`.

In production this same flow is fronted by a direct-to-Vercel-Blob upload (`components/BlobUploadForm.tsx`) to get around Vercel's 4.5MB serverless request-body limit — see `app/api/admin/blob-token` and `app/api/admin/import-from-blob`. Locally, with no `BLOB_READ_WRITE_TOKEN` set, the admin page falls back to a plain multipart upload instead.

## Deployment

Vercel (hosting) + Turso (database) + Vercel Blob (large-file uploads). Environment variables needed in production:

- `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET`
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `BLOB_READ_WRITE_TOKEN` (auto-added by Vercel once a Blob store is attached to the project)
