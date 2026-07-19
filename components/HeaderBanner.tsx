// A clean, vector rebuild of the header banner — my own take on the vintage
// rasta-discography concept from dad's ChatGPT-generated raster, redrawn as
// inline SVG so it's crisp at any size, uses the site's real fonts (Cinzel
// display, EB Garamond, Courier Prime) and palette CSS variables (including
// the adjusted green), and needs no image asset. text-anchor:middle centers
// everything on x=600; textLength pins the wordmark to a fixed width so it
// can't overflow regardless of exact font metrics.

const CX = 600;
const LEFT = 120;
const RIGHT = 1080;
const WIDTH = RIGHT - LEFT;

// Small decorative diamond (rotated square) used to flank the eyebrow.
function Diamond({ x, y }: { x: number; y: number }) {
  return (
    <rect
      x={x - 5}
      y={y - 5}
      width={10}
      height={10}
      transform={`rotate(45 ${x} ${y})`}
      fill="var(--color-rasta-green, #3f7838)"
    />
  );
}

// Five-point star centered at (x,y), radius r.
function Star({ x, y, r }: { x: number; y: number; r: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${x + rr * Math.cos(rad)},${y + rr * Math.sin(rad)}`);
  }
  return <polygon points={pts.join(" ")} fill="var(--color-rasta-red, #9e2b25)" />;
}

export default function HeaderBanner() {
  return (
    <svg
      viewBox="0 0 1200 400"
      role="img"
      aria-label="The Original Roots Knotty Roots — Jamaican Singles Discography 1950–1999"
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Top rasta rule: black, green, gold */}
      <rect x={LEFT} y={22} width={WIDTH} height={7} fill="var(--color-frame, #241b12)" />
      <rect x={LEFT} y={34} width={WIDTH} height={9} fill="var(--color-rasta-green, #3f7838)" />
      <rect x={LEFT} y={48} width={WIDTH} height={5} fill="var(--color-rasta-gold, #c79a3e)" />

      {/* Eyebrow: THE ORIGINAL, flanked by short rules + diamonds */}
      <line x1={LEFT + 90} y1={102} x2={CX - 150} y2={102} stroke="var(--color-rasta-green, #3f7838)" strokeWidth={2} />
      <Diamond x={LEFT + 70} y={102} />
      <text
        x={CX}
        y={112}
        textAnchor="middle"
        fill="var(--color-ink, #3b2a1a)"
        style={{
          fontFamily: "var(--font-garamond), Georgia, serif",
          fontSize: "34px",
          letterSpacing: "10px",
          fontWeight: 600,
        }}
      >
        THE&nbsp;ORIGINAL
      </text>
      <line x1={CX + 150} y1={102} x2={RIGHT - 90} y2={102} stroke="var(--color-rasta-green, #3f7838)" strokeWidth={2} />
      <Diamond x={RIGHT - 70} y={102} />

      {/* Wordmark: ROOTS KNOTTY ROOTS. Three stacked copies give the layered
          vintage-poster look from dad's design, cleanly: (1) a soft dark
          shadow offset down-right for depth, (2) a wide dark outer edge, and
          (3) the green letter with a gold edge on top — so each glyph reads
          green core → gold ring → dark outline. paint-order:stroke draws
          each stroke behind its own fill. textLength pins the whole line to
          940u so it can't overflow regardless of exact font metrics. */}
      <text
        x={CX + 4}
        y={234}
        textAnchor="middle"
        textLength={940}
        lengthAdjust="spacingAndGlyphs"
        fill="var(--color-frame, #241b12)"
        opacity={0.22}
        style={{ fontFamily: "var(--font-cinzel), Georgia, serif", fontSize: "112px", fontWeight: 700 }}
      >
        ROOTS KNOTTY ROOTS
      </text>
      <text
        x={CX}
        y={230}
        textAnchor="middle"
        textLength={940}
        lengthAdjust="spacingAndGlyphs"
        fill="var(--color-frame, #241b12)"
        stroke="var(--color-frame, #241b12)"
        strokeWidth={7}
        paintOrder="stroke"
        style={{ fontFamily: "var(--font-cinzel), Georgia, serif", fontSize: "112px", fontWeight: 700 }}
      >
        ROOTS KNOTTY ROOTS
      </text>
      <text
        x={CX}
        y={230}
        textAnchor="middle"
        textLength={940}
        lengthAdjust="spacingAndGlyphs"
        fill="var(--color-rasta-green, #3f7838)"
        stroke="var(--color-rasta-gold, #c79a3e)"
        strokeWidth={3.5}
        paintOrder="stroke"
        style={{ fontFamily: "var(--font-cinzel), Georgia, serif", fontSize: "112px", fontWeight: 700 }}
      >
        ROOTS KNOTTY ROOTS
      </text>

      {/* Divider: rule — star — rule */}
      <line x1={LEFT + 110} y1={288} x2={CX - 34} y2={288} stroke="var(--color-ink, #3b2a1a)" strokeWidth={1.5} />
      <Star x={CX} y={288} r={13} />
      <line x1={CX + 34} y1={288} x2={RIGHT - 110} y2={288} stroke="var(--color-ink, #3b2a1a)" strokeWidth={1.5} />

      {/* Subtitle in the typewriter face */}
      <text
        x={CX}
        y={338}
        textAnchor="middle"
        fill="var(--color-ink-soft, #5c4630)"
        style={{ fontFamily: "var(--font-courier-prime), 'Courier New', monospace", fontSize: "31px", letterSpacing: "1px" }}
      >
        Jamaican Singles Discography 1950&ndash;1999
      </text>

      {/* Bottom rasta rule: gold, green, black (mirror of top) */}
      <rect x={LEFT} y={356} width={WIDTH} height={5} fill="var(--color-rasta-gold, #c79a3e)" />
      <rect x={LEFT} y={366} width={WIDTH} height={9} fill="var(--color-rasta-green, #3f7838)" />
      <rect x={LEFT} y={380} width={WIDTH} height={7} fill="var(--color-frame, #241b12)" />
    </svg>
  );
}
