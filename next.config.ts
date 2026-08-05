import type { NextConfig } from "next";

// Baseline hardening headers. Note: script-src/style-src allow 'unsafe-inline'
// because Next.js's RSC hydration payload and Tailwind ship inline; that could
// be tightened later with a per-request CSP nonce wired through middleware,
// but this site renders no user-controlled HTML (no dangerouslySetInnerHTML
// anywhere) so the practical XSS surface is already minimal. The other
// directives (frame-ancestors, object-src, form-action, base-uri) are
// unconditionally strict.
// React dev mode uses eval() for debugging call-stack reconstruction only
// ("React will never use eval() in production mode") — allow it in dev so
// the console stays clean, but never in the actual production build.
const isDev = process.env.NODE_ENV !== "production";

// Vercel Analytics / Speed Insights fetch their script SAME-ORIGIN in
// production (/_vercel/insights/script.js, /_vercel/speed-insights/script.js)
// and beacon to /_vercel/insights/event — all covered by 'self', so the
// production CSP stays strict. Only in dev do they load a debug build from
// va.vercel-scripts.com, so that host is allowed in dev alone rather than
// weakening the shipped policy.
const devScriptHosts = isDev ? " https://va.vercel-scripts.com" : "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${devScriptHosts}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // The admin upload form (BlobUploadForm.tsx) PUTs the file directly from the
  // browser to Vercel Blob to route around the 4.5MB serverless request-body
  // limit — a cross-origin fetch that needs an explicit connect-src allowance.
  // The @vercel/blob CLIENT (v2.x) sends its upload requests to the Blob API at
  // `https://vercel.com/api/blob` (see getApiUrl / defaultVercelBlobApiUrl in
  // the package) — NOT to `blob.vercel-storage.com`. Missing `vercel.com` here
  // is exactly what made the upload fail with "Failed to fetch". The
  // *.vercel-storage.com hosts serve the stored blobs (the returned public
  // URL), so they're kept too.
  "connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Force HTTPS for two years, subdomains included. The admin session
          // cookie is Secure, but without HSTS a first visit typed as
          // "http://" still makes one cleartext round trip that an attacker
          // on the network can hijack before the redirect to HTTPS.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
