import type { Metadata } from "next";
import { getInvite, isInviteUsable } from "@/lib/auth/invites";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const inputClass =
  "border border-paper-stain bg-paper px-2 py-1.5 font-body text-ink focus:outline-none focus:border-rasta-red";

function Banner({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" }) {
  const colors = tone === "good" ? "border-rasta-green text-rasta-green" : "border-error text-error";
  return <div className={`border-2 ${colors} bg-paper px-4 py-3 font-body mb-6`}>{children}</div>;
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const error = first(sp.error);

  const invite = await getInvite(token);
  const usable = invite && isInviteUsable(invite);

  if (!usable) {
    return (
      <div className="max-w-sm mx-auto">
        <h1 className="font-display text-2xl text-ink mb-4 text-center">Invite Link</h1>
        <Banner tone="bad">
          This invite link is no longer valid — it may have expired or already been used. Ask the
          site admin to send a fresh one.
        </Banner>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="font-display text-2xl text-ink mb-2 text-center">Set Your Password</h1>
      <p className="font-body text-sm text-ink-soft mb-6 text-center">
        Welcome, <strong>{invite.display_name}</strong>. Choose a password to finish setting up your
        editor account for Roots Knotty Roots.
      </p>

      {error === "weak" && <Banner tone="bad">Password must be at least 8 characters.</Banner>}
      {error === "expired" && (
        <Banner tone="bad">This invite link is no longer valid. Ask for a fresh one.</Banner>
      )}

      <form
        action="/api/editor/accept-invite"
        method="POST"
        className="frame-double bg-paper p-6 flex flex-col gap-3"
      >
        <input type="hidden" name="token" value={token} />
        <label className="flex flex-col gap-1">
          <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Email</span>
          <input
            type="email"
            value={invite.email}
            readOnly
            autoComplete="username"
            className={`${inputClass} text-ink-soft`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-body text-xs uppercase tracking-wide text-ink-soft">
            Password (min 8 characters)
          </span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="mt-2 px-4 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
        >
          Set Password &amp; Sign In
        </button>
      </form>
    </div>
  );
}
