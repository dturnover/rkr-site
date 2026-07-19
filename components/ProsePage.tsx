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
      <div className="font-body text-ink leading-relaxed space-y-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-rasta-red [&_h2]:mt-8 [&_h2]:mb-2 [&_a]:text-link [&_a:hover]:text-rasta-red">
        {children}
      </div>
    </div>
  );
}
