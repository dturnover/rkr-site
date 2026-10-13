"use client";

import { useSyncExternalStore } from "react";

// A timestamp shown in the VIEWER's time zone.
//
// Dates used to be formatted with toLocaleString() on the server — and
// Vercel's servers run on UTC, so every time on the site was UTC. An editor
// creating a record at 8:50 PM Eastern showed up in the modification log as
// "12:50 AM", which reads as hours later (or earlier) than it happened, and
// made a real entry look as if it had appeared late. Formatting in the browser
// is the only way to be right for everyone: the compiler, the editors and the
// visitors are not in one time zone.
//
// The server can't know the viewer's zone, so it renders an explicit UTC time
// (marked "UTC", so it's never mistaken for local), and the browser swaps in
// the local one after hydration. useSyncExternalStore rather than an effect so
// React expects the two to differ and doesn't warn.

const subscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;

export default function LocalTime({
  iso,
  dateOnly = false,
}: {
  iso: string | null | undefined;
  dateOnly?: boolean;
}) {
  const inBrowser = useSyncExternalStore(subscribe, isClient, isServer);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <>{iso}</>;

  const text = inBrowser
    ? dateOnly
      ? d.toLocaleDateString()
      : d.toLocaleString()
    : dateOnly
      ? d.toLocaleDateString("en-US", { timeZone: "UTC" })
      : `${d.toLocaleString("en-US", { timeZone: "UTC" })} UTC`;

  return <time dateTime={d.toISOString()}>{text}</time>;
}
