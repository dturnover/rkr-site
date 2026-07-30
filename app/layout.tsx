import type { Metadata } from "next";
import { Cinzel, EB_Garamond, Courier_Prime, Inconsolata } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteSidebar from "@/components/SiteSidebar";
import SiteFooter from "@/components/SiteFooter";
import { getSession } from "@/lib/auth/requireAdmin";
import { SITE_URL } from "@/lib/siteUrl";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  // 700 is kept for the SVG masthead wordmark (HeaderBanner); 800 is the
  // weight the .font-display headings now render at (see globals.css).
  weight: ["400", "700", "800"],
});

// Loaded as a variable font (no fixed `weight` list) so the body copy can use
// an intermediate weight — see `body { font-weight }` in globals.css. With the
// old static 400/500/600 instances, any in-between value would just snap back
// to one of them.
const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Body copy. A humanist monospace designed as a webfont alternative to
// Consolas — self-hosted by next/font, so every visitor sees the identical
// face rather than falling back to whatever mono their device happens to
// have (iOS/Android/macOS never had Consolas). Loaded as a variable font (no
// fixed `weight` list) so `body { font-weight: 460 }` in globals.css lands on
// a true intermediate weight instead of snapping to 400.
const inconsolata = Inconsolata({
  variable: "--font-inconsolata",
  subsets: ["latin"],
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
      className={`${cinzel.variable} ${garamond.variable} ${courierPrime.variable} ${inconsolata.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <div className="flex-1 w-full flex flex-col lg:flex-row lg:items-start px-3 sm:px-4 lg:px-6 py-6 gap-4 lg:gap-6">
          <SiteSidebar isEditor={!!session} isAdmin={session?.role === "admin"} />
          <main className="flex-1 min-w-0 w-full">{children}</main>
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
