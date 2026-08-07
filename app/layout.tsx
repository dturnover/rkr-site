import type { Metadata } from "next";
import { Cinzel, EB_Garamond, Courier_Prime, Oswald, Zilla_Slab } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteSidebar from "@/components/SiteSidebar";
import SiteFooter from "@/components/SiteFooter";
import HomeMobileSearch from "@/components/HomeMobileSearch";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getSession } from "@/lib/auth/requireAdmin";
import { SITE_URL } from "@/lib/siteUrl";

// Only the SVG masthead wordmark uses Cinzel now, and only at 700 — headings
// moved to Oswald (see --font-display in globals.css). 400 and 800 were still
// being preloaded on every page for nothing.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["700"],
});

// Loaded as a variable font (no fixed `weight` list) so the body copy can use
// an intermediate weight — see `body { font-weight }` in globals.css. With the
// old static 400/500/600 instances, any in-between value would just snap back
// to one of them.
const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
});

// The masthead tagline is the only Courier Prime on the site, at the default
// 400 — the 700 face was preloaded and never rendered.
const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400"],
});

// Headings. A tall, condensed sans with a vintage poster / flyer feel.
// Variable font (no fixed `weight` list), so .font-display in globals.css can
// pick any weight. See --font-display there.
const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
});

// Body copy (and catalogue numbers). A sturdy slab serif with a classic
// record-label feel that pairs with the condensed headings. Self-hosted by
// next/font. Static instances only, so the weights the UI uses are listed
// explicitly (400/500 body, 700 for bold labels and <strong>).
const zillaSlab = Zilla_Slab({
  variable: "--font-zilla-slab",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const SITE_TITLE = "Roots Knotty Roots — The Discography of Jamaican Music";
const SITE_DESCRIPTION =
  "A free, searchable discography of Jamaican music — ska, rocksteady, reggae, dancehall and more. Compiled by Michael Turner & Robert Schoenfeld.";

export const metadata: Metadata = {
  // Lets URL-based metadata below (and the file-based OG/Twitter images) resolve
  // to absolute URLs. Sourced from the deployment — see lib/siteUrl.ts.
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Roots Knotty Roots",
  // The og:image / twitter:image tags are added automatically from
  // app/opengraph-image.tsx and app/twitter-image.tsx.
  openGraph: {
    type: "website",
    siteName: "Roots Knotty Roots",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${garamond.variable} ${courierPrime.variable} ${oswald.variable} ${zillaSlab.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {/* Mobile-only, home-only: puts the search panel above the browse nav
            on phones without touching the desktop layout. */}
        <HomeMobileSearch />
        {/* max-w is in rem so it grows with the large-screen root font scaling
            in globals.css. Without a cap, an ultrawide monitor pinned the
            sidebar to the far left edge with the centred content stranded a
            long way from it. */}
        <div className="flex-1 w-full max-w-[96rem] mx-auto flex flex-col lg:flex-row lg:items-start px-3 sm:px-4 lg:px-6 py-6 gap-4 lg:gap-6">
          <SiteSidebar isEditor={!!session} isAdmin={session?.role === "admin"} />
          <main className="flex-1 min-w-0 w-full">{children}</main>
        </div>
        <SiteFooter />
        {/* Vercel Web Analytics (visitors/page views) and Speed Insights (real
            user performance). Both are cookieless and, in production on Vercel,
            load their script and send beacons SAME-ORIGIN under /_vercel/*, so
            the strict CSP in next.config.ts needs no production exception. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
