import type { Metadata } from "next";
import { FACEBOOK_GROUP_URL } from "@/lib/siteLinks";
import { first, type RawSearchParams } from "@/lib/searchParamsUtil";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Roots Knotty Roots — corrections, additions, questions, or to join the collectors' community.",
};

const inputClass =
  "w-full border border-paper-stain bg-paper px-3 py-2 font-body text-ink focus:outline-none focus:border-rasta-red";

function Banner({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" }) {
  const colors = tone === "good" ? "border-rasta-green text-rasta-green" : "border-error text-error";
  return <div className={`border-2 ${colors} bg-paper px-4 py-3 font-body mb-6`}>{children}</div>;
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sent = first((await searchParams).sent);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-4 text-center">Contact</h1>
      <p className="font-body text-ink-soft italic text-center mb-8">
        Corrections, additions, questions &mdash; or just to say the discography helped.
      </p>

      {sent === "1" && (
        <Banner tone="good">
          Thanks &mdash; your message has been sent. You&rsquo;ll get a reply at the address you
          gave.
        </Banner>
      )}
      {sent === "invalid" && (
        <Banner tone="bad">
          Please fill in your name, a valid email address, and a message of at least a few words.
        </Banner>
      )}
      {sent === "throttled" && (
        <Banner tone="bad">
          That&rsquo;s a lot of messages in a short time &mdash; please wait a few minutes and try
          again.
        </Banner>
      )}

      <section className="frame-double bg-paper p-6 mb-8">
        <h2 className="font-display text-xl text-ink mb-2">Send a message</h2>
        <p className="font-body text-sm text-ink-soft mb-5">
          Spotted a wrong date, a missing pressing, or a record that isn&rsquo;t here at all?
          That&rsquo;s exactly the kind of note we want. Please include the artist, title, and label
          number where you can &mdash; it makes checking much faster.
        </p>

        <form action="/api/contact" method="POST" className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Your name</span>
            <input type="text" name="name" required maxLength={120} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">
              Your email
            </span>
            <input type="email" name="email" required maxLength={254} className={inputClass} />
            <span className="font-body text-xs text-ink-soft">
              Only used to reply to you &mdash; never shown on the site or shared.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs uppercase tracking-wide text-ink-soft">Message</span>
            <textarea name="message" required rows={8} maxLength={5000} className={inputClass} />
          </label>

          {/* Honeypot: hidden from people, irresistible to bots. Kept out of the
              tab order and announced to nobody. */}
          <div className="hidden" aria-hidden="true">
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <button
            type="submit"
            className="self-start px-5 py-2 bg-frame text-paper font-body tracking-wide hover:bg-rasta-red transition-colors"
          >
            Send Message
          </button>
        </form>
      </section>

      <section className="frame-double bg-paper p-6">
        <h2 className="font-display text-xl text-ink mb-2">The collectors&rsquo; group</h2>
        <p className="font-body text-sm text-ink-soft mb-4">
          Roots Knotty Roots has a long-running Facebook group of collectors, selectors, dealers and
          researchers &mdash; thousands of members trading knowledge, sleeve shots and finds. For
          identifying a pressing, chasing a rare label, or discussing the music itself, it&rsquo;s
          often the fastest place to get an answer.
        </p>
        <a
          href={FACEBOOK_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-5 py-2 border border-frame text-ink font-body tracking-wide hover:bg-parchment-deep transition-colors"
        >
          Visit the Facebook group
        </a>
      </section>
    </div>
  );
}
