import { getSession } from "@/lib/auth/requireAdmin";
import { listUsers } from "@/lib/auth/users";
import { getDatabaseStatus } from "@/lib/import/atomicSwap";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";
import BlobUploadForm from "@/components/BlobUploadForm";

function Banner({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" | "bad" }) {
  const colors =
    tone === "good"
      ? "border-rasta-green text-rasta-green"
      : tone === "warn"
        ? "border-rasta-gold text-ink"
        : "border-error text-error";
  return (
    <div className={`border-2 ${colors} bg-paper px-4 py-3 font-body mb-6`}>{children}</div>
  );
}

const inputClass =
  "border border-paper-stain bg-paper px-2 py-1.5 font-body text-ink focus:outline-none focus:border-rasta-red";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const error = first(sp.error);
  const imported = first(sp.imported);
  const warning = first(sp.warning) === "1";
  const restored = first(sp.restored);
  const editorCreated = first(sp.editorCreated) === "1";
  const editorUpdated = first(sp.editorUpdated) === "1";
  const editorError = first(sp.editorError);

  const session = await getSession();

  // ---- Signed out: login form (email + password) ----
  if (!session) {
    return (
      <div className="max-w-sm mx-auto">
        <h1 className="font-display text-2xl text-ink mb-4 text-center">Sign In</h1>
        {error === "invalid-password" && <Banner tone="bad">Incorrect email or password.</Banner>}
        {error === "unauthorized" && <Banner tone="bad">Please sign in again.</Banner>}
        {error === "too-many-attempts" && (
          <Banner tone="bad">Too many failed attempts. Try again in 15 minutes.</Banner>
        )}
        <form action="/api/admin/login" method="POST" className="frame-double bg-paper p-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Email</span>
            <input type="email" name="email" autoComplete="username" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Password</span>
            <input type="password" name="password" required autoComplete="current-password" className={inputClass} />
          </label>
          <button
            type="submit"
            className="mt-2 px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    );
  }

  const isAdmin = session.role === "admin";

  // ---- Signed in as an editor: simple landing (no admin tools) ----
  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl text-ink">Editor</h1>
          <form action="/api/admin/logout" method="POST">
            <button type="submit" className="font-body text-sm text-ink-soft hover:text-rasta-red">
              Sign Out
            </button>
          </form>
        </div>
        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">
            You&rsquo;re signed in as <strong>{session.name}</strong> (editor). Open any track&rsquo;s
            page and use the <em>Editor tools</em> panel to correct fields or add a new record. Your
            changes are attributed to you and preserved across the admin&rsquo;s catalogue updates.
          </p>
        </section>
      </div>
    );
  }

  // ---- Signed in as admin: full tools ----
  const status = await getDatabaseStatus();
  const editors = await listUsers();
  const useBlobUpload = !!process.env.BLOB_READ_WRITE_TOKEN;

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink">Admin</h1>
        <form action="/api/admin/logout" method="POST">
          <button type="submit" className="font-body text-sm text-ink-soft hover:text-rasta-red">
            Sign Out
          </button>
        </form>
      </div>

      {imported && (
        <Banner tone={warning ? "warn" : "good"}>
          Imported {Number(imported).toLocaleString()} tracks.
          {warning &&
            " Warning: this is less than half the previous catalogue size — double-check the file before trusting it, or use Restore Previous below."}
        </Banner>
      )}
      {restored && <Banner tone="good">Restored the previous catalogue version.</Banner>}
      {editorCreated && <Banner tone="good">Editor account created.</Banner>}
      {editorUpdated && <Banner tone="good">Editor access updated.</Banner>}
      {editorError === "duplicate-email" && <Banner tone="bad">That email already has an account.</Banner>}
      {editorError === "invalid" && (
        <Banner tone="bad">Enter a name, a valid email, and a password of at least 8 characters.</Banner>
      )}
      {error === "file-too-large" && (
        <Banner tone="bad">That file is too large. The CSV must be under 300MB.</Banner>
      )}
      {error === "no-file" && <Banner tone="bad">Choose a CSV file before uploading.</Banner>}
      {error &&
        !["invalid-password", "unauthorized", "file-too-large", "no-file"].includes(error) && (
          <Banner tone="bad">Error: {error}</Banner>
        )}

      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-3">Current Catalogue</h2>
        <dl className="font-body text-sm space-y-1">
          <div>
            <dt className="inline text-ink-soft">Tracks: </dt>
            <dd className="inline text-ink">{status.rowCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="inline text-ink-soft">Last updated: </dt>
            <dd className="inline text-ink">
              {status.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : "never"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-2">Upload New CSV</h2>
        <p className="font-body text-sm text-ink-soft mb-4">
          Choose an updated version of the RKR export. This refreshes the live
          catalogue &mdash; the site stays up throughout, editors&rsquo; changes are
          re-applied on top, and the previous version can be restored below.
        </p>
        {useBlobUpload ? (
          <BlobUploadForm />
        ) : (
          <form
            action="/api/admin/upload"
            method="POST"
            encType="multipart/form-data"
            className="flex flex-col gap-3"
          >
            <input type="file" name="csv" accept=".csv" required className="font-body text-sm" />
            <button
              type="submit"
              className="self-start px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
            >
              Upload &amp; Import
            </button>
          </form>
        )}
      </section>

      {/* Manage Editors — provision access for named users */}
      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-2">Editors</h2>
        <p className="font-body text-sm text-ink-soft mb-4">
          Give a trusted contributor editing access. They sign in at this page
          with their email and password, then edit any track directly.
        </p>

        <form action="/api/admin/editors" method="POST" className="flex flex-col gap-3 mb-6">
          <input type="hidden" name="action" value="create" />
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Name</span>
            <input type="text" name="displayName" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Email</span>
            <input type="email" name="email" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">
              Password (min 8 characters)
            </span>
            <input type="text" name="password" required minLength={8} className={inputClass} />
          </label>
          <button
            type="submit"
            className="self-start px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
          >
            Add Editor
          </button>
        </form>

        {editors.length === 0 ? (
          <p className="font-body text-sm text-ink-soft italic">No editor accounts yet.</p>
        ) : (
          <ul className="divide-y divide-paper-stain/50">
            {editors.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                <div className="font-body text-sm">
                  <span className="text-ink">{u.display_name}</span>{" "}
                  <span className="text-ink-soft">&lt;{u.email}&gt;</span>
                  {u.role === "admin" && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-rasta-red">admin</span>
                  )}
                  {!u.active && <span className="ml-2 text-xs uppercase tracking-wide text-ink-soft">disabled</span>}
                </div>
                {u.role !== "admin" && (
                  <form action="/api/admin/editors" method="POST">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="action" value={u.active ? "deactivate" : "reactivate"} />
                    <button
                      type="submit"
                      className="font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink"
                    >
                      {u.active ? "Disable" : "Enable"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {status.hasPrevious && (
        <section className="frame-double bg-paper p-6">
          <h2 className="font-display text-lg text-ink mb-2">Restore Previous Version</h2>
          <p className="font-body text-sm text-ink-soft mb-4">
            Reverts to the catalogue as it was before the most recent import.
          </p>
          <form action="/api/admin/restore-previous" method="POST">
            <button
              type="submit"
              className="px-4 py-2 border border-frame text-ink font-body tracking-wide hover:bg-parchment-deep transition-colors"
            >
              Restore Previous
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
