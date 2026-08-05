import Image from "next/image";
import Link from "next/link";
import { FACEBOOK_GROUP_URL } from "@/lib/siteLinks";

export default function SiteFooter() {
  return (
    <footer className="border-t-2 border-frame bg-parchment-deep/60 mt-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col items-center gap-4 text-center">
        <p className="font-body text-sm text-ink-soft max-w-xl">
          Roots Knotty Roots is a free, independent discography of Jamaican
          music &mdash; compiled over decades and shared here so it stays
          freely available to collectors, researchers, and fans everywhere.
        </p>
        <p className="font-body text-sm">
          <Link href="/contact" className="text-link underline hover:text-rasta-red">
            Contact
          </Link>
          <span className="text-ink-soft"> &middot; </span>
          <a
            href={FACEBOOK_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link underline hover:text-rasta-red"
          >
            Facebook group
          </a>
        </p>
        <Image
          src="/rkr-logo.png"
          alt="Roots Knotty Roots"
          width={492}
          height={235}
          className="w-28 h-auto"
        />
      </div>
    </footer>
  );
}
