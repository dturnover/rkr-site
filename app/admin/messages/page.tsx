import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/requireAdmin";
import { listContactMessages, contactRecipient } from "@/lib/contact";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function MessagesPage() {
  const session = await getSession();
  if (!session) redirect("/admin");
  if (session.role !== "admin") redirect("/admin"); // admin only

  const messages = await listContactMessages();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-ink">Messages</h1>
        <Link href="/admin" className="font-body text-sm text-ink-soft hover:text-rasta-red">
          &larr; Back to Admin
        </Link>
      </div>

      <p className="font-body text-sm text-ink-soft mb-6">
        Everything sent through the contact form, newest first. Each one is also emailed to{" "}
        <strong>{contactRecipient()}</strong> &mdash; this list is the backup, so a message is never
        lost even if email delivery fails.
      </p>

      {messages.length === 0 ? (
        <section className="frame-double bg-paper p-6">
          <p className="font-body text-ink">No messages yet.</p>
        </section>
      ) : (
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className="frame-double bg-paper p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <div className="font-body text-sm">
                  <span className="text-ink font-semibold">{m.name}</span>{" "}
                  <a
                    href={`mailto:${m.email}`}
                    className="text-link underline hover:text-rasta-red break-all"
                  >
                    &lt;{m.email}&gt;
                  </a>
                </div>
                <div className="font-body text-xs text-ink-soft">
                  {new Date(m.created_at).toLocaleString()}
                  {!m.emailed && (
                    <span className="ml-2 text-error uppercase tracking-wide">not emailed</span>
                  )}
                </div>
              </div>
              <p className="font-body text-sm text-ink whitespace-pre-wrap">{m.message}</p>
              <form action="/api/admin/messages" method="POST" className="mt-3">
                <input type="hidden" name="id" value={m.id} />
                <button
                  type="submit"
                  className="font-body text-xs border border-paper-stain px-2 py-1 hover:bg-parchment-deep text-ink"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
