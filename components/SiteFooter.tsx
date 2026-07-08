import Image from "next/image";

export default function SiteFooter() {
  return (
    <footer className="border-t-2 border-frame bg-parchment-deep/60 mt-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center gap-4 text-center">
        <p className="font-body text-sm text-ink-soft max-w-xl">
          Roots Knotty Roots is a free, independent discography of Jamaican
          music &mdash; compiled over decades and shared here so it stays
          freely available to collectors, researchers, and fans everywhere.
        </p>
        <Image
          src="/rkr-logo.png"
          alt="Roots Knotty Roots"
          width={492}
          height={235}
          className="w-24 h-auto border border-paper-stain shadow-sm"
        />
      </div>
    </footer>
  );
}
