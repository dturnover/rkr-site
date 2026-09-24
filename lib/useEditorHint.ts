"use client";

import { useSyncExternalStore } from "react";
import { EDITOR_HINT_COOKIE_NAME } from "@/lib/auth/cookieNames";
import type { Role } from "@/lib/auth/cookieNames";

// Reads the non-secret hint cookie so cached, static pages can still draw the
// editor's own navigation.
//
// WHY THIS EXISTS: the root layout used to call getSession(), which reads
// cookies — and a layout that reads cookies makes EVERY route in the
// application render per request. That single line is what kept all 135,543
// record pages out of the cache, and it cost 3.58 million function invocations
// and 30.9 million billed telemetry events in one month, against roughly
// 25,000 real human page views.
//
// THIS IS NOT AUTHENTICATION AND MUST NEVER BECOME IT. The cookie is
// unsigned and readable and writable by anyone; all it decides is which links
// are drawn. Every page it links to re-checks the real signed session on the
// server (lib/auth/requireAdmin.ts) and redirects anyone who isn't entitled to
// be there. Forging this cookie gets you a menu, not access.
//
// useSyncExternalStore rather than useState + useEffect because the server has
// no idea what this browser's cookies say: the server snapshot is always null,
// so the cached HTML is identical for everyone and the links appear on the
// client after hydration without React complaining that the two disagree.

function readHint(): Role | null {
  const prefix = `${EDITOR_HINT_COOKIE_NAME}=`;
  for (const part of document.cookie.split(";")) {
    const c = part.trim();
    if (!c.startsWith(prefix)) continue;
    const value = c.slice(prefix.length);
    // Older cookies (and anything hand-edited) may say "1" rather than a role.
    // Treat anything unrecognised as the lesser privilege — the server decides
    // for real either way, so the safe default is the smaller menu.
    return value === "admin" ? "admin" : "editor";
  }
  return null;
}

// The cookie only changes on sign-in or sign-out, both of which are full page
// navigations, so there is nothing to subscribe to.
const subscribe = () => () => {};
const serverSnapshot = () => null;

export function useEditorHint(): { isEditor: boolean; isAdmin: boolean } {
  const role = useSyncExternalStore(subscribe, readHint, serverSnapshot);
  return { isEditor: role !== null, isAdmin: role === "admin" };
}
