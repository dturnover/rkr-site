import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth/requireAdmin";
import { listUsers } from "@/lib/auth/users";
import { listPendingInvites } from "@/lib/auth/invites";
import { inviteUrl, isEmailConfigured } from "@/lib/email/send";
import { getDatabaseStatus } from "@/lib/import/atomicSwap";
import { countNotesForEditor, countUnreviewedLog } from "@/lib/editor/overlay";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";
import BlobUploadForm from "@/components/BlobUploadForm";
import CopyLink from "@/components/CopyLink";

// robots.txt asks crawlers not to fetch this path, but that only works for
// crawlers that read it — and a URL that leaks some other way (a referrer, a
// pasted link) can still be indexed. noindex is the directive that actually
// keeps the sign-in page out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

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
  const invited = first(sp.invited); // "sent" | "link" (no provider) | "failed"
  const inviteRevoked = first(sp.inviteRevoked) === "1";
  const editorUpdated = first(sp.editorUpdated) === "1";
  const editorError = first(sp.editorError);
  const reset = first(sp.reset); // "sent" | "link" | "failed"
  const resetToken = first(sp.resetToken);
  const mailTest = first(sp.mailTest); // "sent" | "link" | "failed" | "invalid"
  const mailError = first(sp.mailError);

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
    const myNotes = await countNotesForEditor(session.name);
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

        {/* Notes are left against a single change, which an editor would
            otherwise only find by revisiting that exact record — so the count
            is surfaced here, on the page they land on. */}
        {myNotes > 0 && (
          <Banner tone="warn">
            Michael has left {myNotes === 1 ? "a note" : `${myNotes} notes`} on your changes.{" "}
            <Link href="/mod-log?filter=noted" className="text-link underline hover:text-rasta-red">
              Read {myNotes === 1 ? "it" : "them"}
            </Link>
            .
          </Banner>
        )}

        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">
            You&rsquo;re signed in as <strong>{session.name}</strong> (editor). Open any track&rsquo;s
            page and use the <em>Editor tools</em> panel to correct fields or add a new record. Your
            changes are attributed to you and preserved across the admin&rsquo;s catalogue updates.
          </p>
          <p className="font-body text-sm text-ink-soft mt-3">
            <Link href="/mod-log" className="text-link underline hover:text-rasta-red">
              Modification log
            </Link>{" "}
            &mdash; every change across the catalogue, including any notes left on yours.
          </p>
        </section>
      </div>
    );
  }

  // ---- Signed in as admin: full tools ----
  const status = await getDatabaseStatus();
  const editors = await listUsers();
  const pendingInvites = await listPendingInvites();
  const useBlobUpload = !!process.env.BLOB_READ_WRITE_TOKEN;
  const emailReady = isEmailConfigured();
  const unreviewedCount = await countUnreviewedLog();

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
      {invited === "sent" && (
        <Banner tone="good">Invite emailed. They&rsquo;ll get a link to set their password.</Banner>
      )}
      {invited === "link" && (
        <Banner tone="warn">
          Invite created. No email was sent (no mail provider configured) &mdash; copy the invite
          link below and send it to them yourself.
        </Banner>
      )}
      {invited === "failed" && (
        <Banner tone="bad">
          Invite created, but the email couldn&rsquo;t be sent{mailError ? `: ${mailError}` : "."} Use
          the copy-link button below to send it yourself.
        </Banner>
      )}
      {inviteRevoked && <Banner tone="good">Invite revoked.</Banner>}
      {reset === "sent" && (
        <Banner tone="good">
          Password-reset link emailed. It works once and expires in 7 days.
        </Banner>
      )}
      {(reset === "link" || reset === "failed") && resetToken && (
        <Banner tone="warn">
          <p className="mb-2">
            {reset === "link"
              ? "Password-reset link created (no mail provider configured) — send them this link:"
              : `Reset link created, but the email couldn't be sent${mailError ? `: ${mailError}` : "."} Send them this link:`}
          </p>
          <CopyLink url={inviteUrl(resetToken)} />
        </Banner>
      )}
      {mailTest === "sent" && (
        <Banner tone="good">Test email sent. If it arrives, invites will work too.</Banner>
      )}
      {mailTest === "link" && (
        <Banner tone="warn">
          No mail provider configured &mdash; set RESEND_API_KEY and INVITE_FROM_EMAIL in Vercel.
        </Banner>
      )}
      {mailTest === "failed" && (
        <Banner tone="bad">Test email failed{mailError ? `: ${mailError}` : "."}</Banner>
      )}
      {mailTest === "invalid" && <Banner tone="bad">Enter a valid email address to test.</Banner>}
      {editorUpdated && <Banner tone="good">Editor access updated.</Banner>}
      {editorError === "duplicate-email" && <Banner tone="bad">That email already has an account.</Banner>}
      {editorError === "no-user" && <Banner tone="bad">That account no longer exists.</Banner>}
      {editorError === "invalid" && (
        <Banner tone="bad">Enter a name and a valid email address.</Banner>
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
        <p className="font-body text-sm mt-4">
          <Link href="/mod-log" className="text-link underline hover:text-rasta-red">
            View the modification log
          </Link>
          <span className="text-ink-soft">
            {" "}
            &mdash; every change across the catalogue
            {unreviewedCount > 0 ? ", " : "."}
          </span>
          {unreviewedCount > 0 && (
            <Link
              href="/mod-log?filter=unreviewed"
              className="text-rasta-red underline hover:text-ink"
            >
              {unreviewedCount.toLocaleString()} not yet reviewed
            </Link>
          )}
          {unreviewedCount > 0 && <span className="text-ink-soft">.</span>}
        </p>
        <p className="font-body text-sm mt-2">
          <Link href="/admin/history" className="text-link underline hover:text-rasta-red">
            Import history &amp; restore points
          </Link>
          <span className="text-ink-soft"> &mdash; download the catalogue as it was before any recent upload.</span>
        </p>
        <p className="font-body text-sm mt-2">
          <Link href="/admin/traffic" className="text-link underline hover:text-rasta-red">
            Bulk copying
          </Link>
          <span className="text-ink-soft">
            {" "}
            &mdash; anyone reading fast enough to be taking the whole catalogue.
          </span>
        </p>
        <p className="font-body text-sm mt-2">
          <Link href="/admin/edits" className="text-link underline hover:text-rasta-red">
            Editor overrides
          </Link>
          <span className="text-ink-soft"> &mdash; every on-site correction that re-applies over dad&rsquo;s uploads.</span>
        </p>
        <p className="font-body text-sm mt-2">
          <Link href="/admin/messages" className="text-link underline hover:text-rasta-red">
            Contact messages
          </Link>
          <span className="text-ink-soft"> &mdash; everything sent through the contact form.</span>
        </p>
      </section>

      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-2">Upload New Catalogue</h2>
        <p className="font-body text-sm text-ink-soft mb-4">
          Choose an updated version of the RKR catalogue &mdash; either your Excel
          workbook (.xlsx) or a CSV export. This refreshes the live catalogue: the
          site stays up throughout, editors&rsquo; changes are re-applied on top, and
          the previous version can be restored below.
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
            <input type="file" name="csv" accept=".csv,.xlsx" required className="font-body text-sm" />
            <button
              type="submit"
              className="self-start px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
            >
              Upload &amp; Import
            </button>
          </form>
        )}
      </section>

      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-2">Export Catalogue</h2>
        <p className="font-body text-sm text-ink-soft mb-4">
          Download the current catalogue as an Excel spreadsheet &mdash; the live
          data including every editor&rsquo;s corrections and added records. It
          uses the same column order as the import, so it can be edited and
          re-uploaded. A large catalogue may take a little while to prepare.
        </p>
        {/* Plain anchor (not a prefetched link) so navigating triggers the
            download rather than Next prefetching this heavy route. */}
        <a
          href="/api/admin/export"
          className="inline-block px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
        >
          Download XLSX
        </a>
      </section>

      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-2">Suggested Corrections</h2>
        <p className="font-body text-sm text-ink-soft mb-4">
          Review likely misspellings the site has flagged in the fixed categories
          (Country, Format, Genre) and fix them in one click. Admin only.
        </p>
        <Link
          href="/admin/typos"
          className="inline-block px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
        >
          Review Suggested Corrections
        </Link>
      </section>

      {/* Email delivery — status + a way to verify it without a real invite */}
      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-2">Email</h2>
        {emailReady ? (
          <>
            <p className="font-body text-sm text-ink-soft mb-4">
              Email is set up &mdash; invites and password resets send automatically. Send a test to
              any address to confirm delivery.
            </p>
            <form action="/api/admin/editors" method="POST" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="action" value="test-email" />
              <label className="flex flex-col gap-1">
                <span className="font-body text-xs uppercase tracking-wide text-ink-soft">
                  Send a test email to
                </span>
                <input type="email" name="testEmail" required className={inputClass} />
              </label>
              <button
                type="submit"
                className="px-4 py-2 border border-frame text-ink font-body tracking-wide hover:bg-parchment-deep transition-colors"
              >
                Send Test
              </button>
            </form>
          </>
        ) : (
          <p className="font-body text-sm text-ink-soft">
            No mail provider configured, so invites and password resets show a{" "}
            <strong>copyable link</strong> to send by hand instead &mdash; everything still works.
            To enable automatic email, add <code>RESEND_API_KEY</code> and{" "}
            <code>INVITE_FROM_EMAIL</code> in the Vercel project settings and redeploy.
          </p>
        )}
      </section>

      {/* Manage Editors — provision access for named users */}
      <section className="frame-double bg-paper p-6 mb-6">
        <h2 className="font-display text-lg text-ink mb-2">Editors</h2>
        <p className="font-body text-sm text-ink-soft mb-4">
          Invite a trusted contributor. Enter their name and email &mdash; they get a link to
          <strong> choose their own password</strong>, then they can edit any track directly. You
          never see or set their password.
        </p>

        <form action="/api/admin/editors" method="POST" className="flex flex-col gap-3 mb-6">
          <input type="hidden" name="action" value="invite" />
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Name</span>
            <input type="text" name="displayName" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Email</span>
            <input type="email" name="email" required className={inputClass} />
          </label>
          <button
            type="submit"
            className="self-start px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
          >
            Send Invite
          </button>
        </form>

        {pendingInvites.length > 0 && (
          <div className="mb-6">
            <h3 className="font-body text-xs uppercase tracking-wide text-ink-soft mb-2">
              Pending invites
            </h3>
            <ul className="space-y-3">
              {pendingInvites.map((inv) => (
                <li key={inv.token} className="border border-paper-stain/60 bg-parchment/20 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="font-body text-sm min-w-0">
                      <span className="text-ink">{inv.display_name}</span>{" "}
                      <span className="text-ink-soft">&lt;{inv.email}&gt;</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {emailReady && (
                        <form action="/api/admin/editors" method="POST">
                          <input type="hidden" name="action" value="resend-invite" />
                          <input type="hidden" name="token" value={inv.token} />
                          <button
                            type="submit"
                            className="font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink whitespace-nowrap"
                          >
                            Resend email
                          </button>
                        </form>
                      )}
                      <form action="/api/admin/editors" method="POST">
                        <input type="hidden" name="action" value="revoke-invite" />
                        <input type="hidden" name="token" value={inv.token} />
                        <button
                          type="submit"
                          className="font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink"
                        >
                          Revoke
                        </button>
                      </form>
                    </div>
                  </div>
                  <CopyLink url={inviteUrl(inv.token)} />
                </li>
              ))}
            </ul>
          </div>
        )}

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
                  <div className="flex items-center gap-2 shrink-0">
                    {u.active && (
                      <form action="/api/admin/editors" method="POST">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="action" value="reset-password" />
                        <button
                          type="submit"
                          className="font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink whitespace-nowrap"
                          title="Email them a one-time link to choose a new password"
                        >
                          Reset password
                        </button>
                      </form>
                    )}
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
                  </div>
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
