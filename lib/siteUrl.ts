/**
 * The site's canonical, absolute base URL. Metadata (Open Graph, canonical
 * links), the sitemap, and robots.txt all need fully-qualified URLs, so this
 * is the single place that resolves it.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_SITE_URL — set this in Vercel once a custom domain is
 *     attached (e.g. https://rootsknottyroots.com) so share cards and the
 *     sitemap point at the real domain rather than the *.vercel.app URL.
 *  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel injects the project's *stable*
 *     production domain here automatically; a sensible default before a
 *     custom domain exists. (VERCEL_URL is per-deployment and would churn
 *     the canonical URL on every push, so it is deliberately not used.)
 *  3. http://localhost:3000 — local development fallback.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
