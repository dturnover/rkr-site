import { ImageResponse } from "next/og";

// Sitewide social share card (inherited by every route unless a segment
// overrides it). Rebuilds the masthead — parchment, rasta rules, wordmark —
// as an ImageResponse so shared links render a branded card instead of a
// blank grey box. Deliberately self-contained: no image assets, and no
// custom font (next/og's default sans renders reliably everywhere).
export const alt =
  "Roots Knotty Roots — The Original: Jamaican Singles Discography 1950–1999";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Palette mirrors globals.css. Satori doesn't resolve CSS custom properties,
// so these are the literal hex values.
const PARCHMENT = "#ecdfc4";
const INK = "#3b2a1a";
const INK_SOFT = "#5c4630";
const FRAME = "#241b12";
const RED = "#9e2b25";
const GOLD = "#c79a3e";
const GREEN = "#3f7838";

function RastaRule({ reversed = false }: { reversed?: boolean }) {
  const bars = reversed
    ? [
        { c: GOLD, h: 6 },
        { c: GREEN, h: 10 },
        { c: FRAME, h: 8 },
      ]
    : [
        { c: FRAME, h: 8 },
        { c: GREEN, h: 10 },
        { c: GOLD, h: 6 },
      ];
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 760, gap: 4 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ display: "flex", width: "100%", height: b.h, background: b.c }} />
      ))}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: PARCHMENT,
          color: INK,
          fontFamily: "sans-serif",
          padding: 60,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            border: `3px solid ${FRAME}`,
            outline: `1px solid ${FRAME}`,
            outlineOffset: 8,
            padding: "48px 40px",
          }}
        >
          <RastaRule />

          <div
            style={{
              display: "flex",
              fontSize: 30,
              letterSpacing: 12,
              fontWeight: 600,
              color: INK,
              marginTop: 40,
              marginBottom: 18,
            }}
          >
            THE ORIGINAL
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 74,
              fontWeight: 800,
              letterSpacing: 1,
              color: GREEN,
              textShadow: `2px 2px 0 ${FRAME}`,
              lineHeight: 1,
              // One line, always — wrapping collided with the divider below.
              whiteSpace: "nowrap",
            }}
          >
            ROOTS KNOTTY ROOTS
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 26, marginBottom: 22 }}>
            <div style={{ display: "flex", width: 120, height: 2, background: INK }} />
            {/* Drawn diamond, not a glyph — keeps the card free of any dynamic
                font fetch (a ★ character triggers one and can render as tofu). */}
            <div style={{ display: "flex", width: 16, height: 16, background: RED, transform: "rotate(45deg)" }} />
            <div style={{ display: "flex", width: 120, height: 2, background: INK }} />
          </div>

          <div style={{ display: "flex", fontSize: 32, letterSpacing: 1, color: INK_SOFT, marginBottom: 40 }}>
            Jamaican Singles Discography 1950–1999
          </div>

          <RastaRule reversed />
        </div>
      </div>
    ),
    { ...size },
  );
}
