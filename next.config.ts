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

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // The admin upload form (BlobUploadForm.tsx) PUTs the CSV directly from
  // the browser to Vercel Blob storage to route around the 4.5MB
  // serverless request-body limit — that's a cross-origin fetch, so it
  // needs an explicit connect-src allowance. Harmless when unused locally.
  "connect-src 'self' https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
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
