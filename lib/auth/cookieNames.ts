// Cookie names and write options, kept free of any Node-only import.
//
// lib/auth/session.ts does the signing, so it pulls in node:crypto — which
// makes it unimportable from a client component. components/EditThisTrack.tsx
// is a client component and needs to know what the hint cookie is called, so
// the plain constants live here and session.ts re-exports them. Nothing in
// this file may import anything that isn't isomorphic.

export type Role = "admin" | "editor";

export const SESSION_COOKIE_NAME = "rkr_admin";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_MAX_AGE_SECONDS = SEVEN_DAYS_SECONDS;

/** The one definition of how the session cookie is written, so the login and
 * invite-acceptance paths can't drift apart.
 *
 * sameSite is "lax", NOT "strict". Under Strict the browser withholds the
 * cookie on ANY navigation that originates off-site — so an editor who opened a
 * track link from a text message, an email, or a search result landed on a page
 * that rendered as signed-out (observed: the editor nav links and the Editor
 * Tools panel simply weren't there, until they clicked something internal).
 * Lax still withholds the cookie on cross-site POSTs, which is the CSRF
 * protection these plain-form endpoints actually rely on, while sending it on
 * ordinary top-level GET navigations. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;

/** A second, deliberately NON-secret cookie that exists only so a fully cached
 * page can decide whether to show the "Edit this track" link.
 *
 * The record pages are the 135k-page surface search engines and scrapers walk,
 * and they are served from the CDN as static HTML — which means no server code
 * runs on a visit, which in turn means nothing can read the session. Without
 * some client-visible signal, the only ways to show editors their link would be
 * to make all 135k pages dynamic again (the thing that cost $27 a month in
 * telemetry alone) or to show an Edit link to the whole public.
 *
 * This cookie GRANTS NOTHING. It carries no identity, no role and no
 * signature; forging it reveals a link to a page that then checks the real
 * session server-side and redirects anyone who isn't signed in. It is a hint
 * about what to draw, and it is treated as untrusted everywhere else.
 *
 * httpOnly is false ON PURPOSE — client JavaScript has to be able to read it.
 * That is exactly why the real session cookie above stays httpOnly and why
 * nothing sensitive may ever be added here. */
export const EDITOR_HINT_COOKIE_NAME = "rkr_editor";

/** The hint's value is the role, so the sidebar knows whether to draw the
 * admin-only links. Still not a credential — see above. */
export type EditorHint = Role;

export const EDITOR_HINT_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
} as const;
