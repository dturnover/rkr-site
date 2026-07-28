import type { Metadata } from "next";
import { Cinzel, EB_Garamond, Courier_Prime } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteSidebar from "@/components/SiteSidebar";
import SiteFooter from "@/components/SiteFooter";
import { getSession } from "@/lib/auth/requireAdmin";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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

export const metadata: Metadata = {
  title: "Roots Knotty Roots — The Discography of Jamaican Music",
  description:
    "A free, searchable discography of Jamaican music — ska, rocksteady, reggae, dancehall and more. Compiled by Michael Turner & Robert Schoenfeld.",
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
      className={`${cinzel.variable} ${garamond.variable} ${courierPrime.variable} h-full antialiased`}
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
