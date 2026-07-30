// Shared prose styling for long-form content (guide, history, interviews, and
// the guide section on the home page). Exported so callers that don't use the
// full ProsePage shell — e.g. the home page embedding GuideContent — get the
// exact same heading/link treatment.
// The `[&_h2]:font-display` variants set only the heading font-FAMILY (Oswald),
// so pin an explicit weight here to match the class-based `.font-display`
// headings elsewhere (semibold — see globals.css).
export const PROSE_CLASS =
  "font-body text-ink leading-relaxed space-y-4 [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-3xl [&_h2]:text-rasta-red [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:font-display [&_h3]:font-semibold [&_h3]:text-xl [&_h3]:text-ink [&_h3]:mt-6 [&_h3]:mb-1 [&_a]:text-link [&_a:hover]:text-rasta-red";

export default function ProsePage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-display text-3xl sm:text-4xl text-ink mb-4 text-center">{title}</h1>
      {intro ? (
        <p className="font-body text-ink-soft italic text-center mb-8">{intro}</p>
      ) : null}
      <div className={PROSE_CLASS}>{children}</div>
    </div>
  );
}
