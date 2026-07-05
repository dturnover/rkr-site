import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center py-16">
      <h1 className="font-display text-4xl text-rasta-red mb-3">Not Found</h1>
      <p className="font-body text-ink-soft mb-6">
        That page, artist, or record doesn&rsquo;t appear in the catalogue.
      </p>
      <Link href="/" className="font-body text-link hover:text-rasta-red underline">
        Back to the home page
      </Link>
    </div>
  );
}
