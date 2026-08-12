import { FLAGS } from "@/lib/settings";

/** The admin's own off switches.
 *
 * Written for someone who may be using it precisely because something is
 * broken and the person who built it isn't answering: every switch says what
 * it does, what happens when it's off, and takes one click. Nothing here needs
 * a deploy, a redeploy, or anything typed into Vercel.
 */
export default function FeatureSwitches({ flags }: { flags: Record<string, boolean> }) {
  const keys = Object.keys(FLAGS);
  if (keys.length === 0) return null;

  return (
    <section className="frame-double bg-paper p-6 mb-6">
      <h2 className="font-display text-lg text-ink mb-1">Turn Features Off</h2>
      <p className="font-body text-sm text-ink-soft mb-5">
        If something new is behaving badly, switch it off here. It takes effect straight away
        across the whole site, nothing needs redeploying, and turning it back on later changes
        nothing else &mdash; no data is altered either way.
      </p>

      <ul className="space-y-5">
        {keys.map((key) => {
          const flag = FLAGS[key];
          const on = flags[key];
          return (
            <li key={key} className="border-t border-paper-stain pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[15rem]">
                  <p className="font-body text-ink">
                    <strong>{flag.label}</strong>{" "}
                    <span
                      className={`text-xs uppercase tracking-wide ${
                        on ? "text-rasta-green" : "text-error"
                      }`}
                    >
                      {on ? "on" : "off"}
                    </span>
                  </p>
                  <p className="font-body text-sm text-ink-soft mt-1">{flag.description}</p>
                  <p className="font-body text-sm text-ink-soft mt-1 italic">
                    {on ? `Switched off: ${flag.whenOff}` : flag.whenOff}
                  </p>
                </div>
                <form action="/api/admin/settings" method="POST">
                  <input type="hidden" name="key" value={key} />
                  <input type="hidden" name="on" value={on ? "0" : "1"} />
                  <button
                    type="submit"
                    className={`px-4 py-2 font-body text-sm tracking-wide whitespace-nowrap transition-colors ${
                      on
                        ? "bg-error text-paper hover:opacity-90"
                        : "bg-frame text-paper hover:bg-rasta-red"
                    }`}
                  >
                    {on ? "Switch Off" : "Switch Back On"}
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
