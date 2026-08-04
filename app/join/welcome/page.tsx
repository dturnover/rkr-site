import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/requireAdmin";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// Shown once, right after a new editor sets their password (accept-invite
// redirects here). If someone lands here without a session, send them to sign
// in rather than showing a guide to nobody.
export default async function WelcomePage() {
  const session = await getSession();
  if (!session) redirect("/admin");

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-display text-2xl text-ink mb-2">You&rsquo;re all set, {session.name} 🎉</h1>
      <p className="font-body text-ink-soft mb-6">
        Your editor account is ready. Here&rsquo;s how to help keep the Roots Knotty Roots catalogue
        accurate.
      </p>

      <section className="frame-double bg-paper p-6 mb-6 font-body text-ink space-y-4">
        <div>
          <h2 className="font-display text-lg mb-1">Editing a record</h2>
          <p className="text-sm text-ink-soft">
            Find any track (browse or search), open its page, and use the{" "}
            <strong>Editor tools</strong> panel to correct a field or add a new record. Changes save
            immediately and are attributed to you.
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg mb-1">Your changes are safe</h2>
          <p className="text-sm text-ink-soft">
            When the admin uploads a refreshed catalogue, your edits are re-applied on top &mdash;
            they&rsquo;re never overwritten.
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg mb-1">Modification log</h2>
          <p className="text-sm text-ink-soft">
            Every change across the catalogue is recorded in the{" "}
            <Link href="/mod-log" className="text-link underline hover:text-rasta-red">
              modification log
            </Link>{" "}
            &mdash; a good place to see recent activity and double-check your own edits.
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg mb-1">Signing in later</h2>
          <p className="text-sm text-ink-soft">
            Return to the{" "}
            <Link href="/admin" className="text-link underline hover:text-rasta-red">
              sign-in page
            </Link>{" "}
            and log in with your email and the password you just set.
          </p>
        </div>
      </section>

      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
        >
          Start browsing
        </Link>
        <Link
          href="/admin"
          className="inline-block px-4 py-2 border border-frame text-ink font-body tracking-wide hover:bg-parchment-deep transition-colors"
        >
          Go to my account
        </Link>
      </div>
    </div>
  );
}
