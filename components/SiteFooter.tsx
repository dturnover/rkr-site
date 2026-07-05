export default function SiteFooter() {
  return (
    <footer className="border-t-2 border-frame bg-parchment-deep/60 mt-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center gap-3 text-center">
        <svg
          width="40"
          height="20"
          viewBox="0 0 40 20"
          fill="none"
          stroke="var(--ink-brown-soft)"
          strokeWidth="1.2"
          aria-hidden
        >
          <circle cx="10" cy="10" r="8" />
          <circle cx="10" cy="10" r="2" />
          <path d="M22 3 L30 3 L34 17 L18 17 Z" />
        </svg>
        <p className="font-body text-sm text-ink-soft max-w-xl">
          Roots Knotty Roots is a free, independent discography of Jamaican
          music &mdash; compiled over decades and shared here so it stays
          freely available to collectors, researchers, and fans everywhere.
        </p>
      </div>
    </footer>
  );
}
