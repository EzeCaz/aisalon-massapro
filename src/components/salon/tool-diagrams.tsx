"use client";

import type { ReactElement } from "react";

/**
 * Custom SVG diagrams for tools that have a visual model in the source book.
 * Each diagram is keyed by tool slug. If a slug isn't in the map, nothing renders.
 *
 * All diagrams follow the AI Salon brand book:
 *  - Cyan primary  (#00E5FF / oklch(0.82 0.16 200))
 *  - Pink accent    (#FF005C / oklch(0.65 0.27 0))
 *  - Ink text       (oklch(0.16 0.01 240))
 *  - Fraunces / Geist Sans typography (inherited from page)
 */

interface DiagramProps {
  /** The accent CSS variable for the tool — either var(--salon-cyan) or var(--salon-pink). */
  accentVar: string;
}

const CYAN = "var(--salon-cyan)";
const PINK = "var(--salon-pink)";

/** Helper: pick a complementary accent for a given accent (cyan↔pink). */
function altAccent(accentVar: string) {
  return accentVar.includes("pink") ? CYAN : PINK;
}

/* ============================================================
 * 1. HUMAN QUALITIES SPECTRUM (R–L–T)
 *    A horizontal spectrum flowing left → right with three zones.
 * ============================================================ */
function HumanQualitiesSpectrumDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  return (
    <figure className="my-2">
      <svg
        viewBox="0 0 800 360"
        className="w-full h-auto"
        role="img"
        aria-label="Human Qualities Spectrum: Replicable on the left, Relational in the middle, Transcendent on the right"
      >
        <defs>
          <linearGradient id="hqs-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={accentVar} stopOpacity="0.85" />
            <stop offset="50%" stopColor={accentVar} stopOpacity="0.55" />
            <stop offset="100%" stopColor={alt} stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Spectrum bar */}
        <rect x="60" y="170" width="680" height="44" rx="22" fill="url(#hqs-grad)" />

        {/* Tick marks for R / L / T zone dividers */}
        {[170, 400, 630].map((tx, i) => (
          <line
            key={i}
            x1={tx}
            x2={tx}
            y1="158"
            y2="226"
            stroke="var(--salon-paper)"
            strokeWidth="2"
          />
        ))}

        {/* Zone labels above */}
        <text x="170" y="135" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-ink)">
          Replicable
        </text>
        <text x="170" y="158" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="600" fill={accentVar} letterSpacing="2">
          R
        </text>
        <text x="400" y="135" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-ink)">
          Relational
        </text>
        <text x="400" y="158" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="600" fill={accentVar} letterSpacing="2">
          L
        </text>
        <text x="630" y="135" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-ink)">
          Transcendent
        </text>
        <text x="630" y="158" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="600" fill={alt} letterSpacing="2">
          T
        </text>

        {/* Descriptions below */}
        <text x="170" y="252" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.7">
          Skills AI can master —
        </text>
        <text x="170" y="270" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.7">
          calculation, pattern, style.
        </text>

        <text x="400" y="252" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.7">
          Presence, context, the room —
        </text>
        <text x="400" y="270" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.7">
          AI joins but misses the current.
        </text>

        <text x="630" y="252" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.7">
          Meaning, moral imagination —
        </text>
        <text x="630" y="270" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.7">
          what arises from being human.
        </text>

        {/* Direction-of-investment arrow */}
        <g transform="translate(60 308)">
          <line x1="0" y1="0" x2="660" y2="0" stroke={alt} strokeWidth="2" />
          <polygon points="660,0 650,-6 650,6" fill={alt} />
          <text x="330" y="-8" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="700" fill={alt} letterSpacing="3">
            INVEST YOURSELF →
          </text>
        </g>
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        Not a hierarchy — we need all three. But stop pretending the left end makes you irreplaceable.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * 2. IDENTITY MATRIX
 *    A 2×2 grid: Enduring Essence · Evolving Expression ·
 *    Replaceable Skills · Yet To Be Cultivated.
 * ============================================================ */
function IdentityMatrixDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  const cells = [
    { x: 40, y: 40, label: "Enduring Essence", sub: "Who you are across every context", fill: accentVar, text: "var(--salon-paper)", accent: accentVar },
    { x: 400, y: 40, label: "Evolving Expression", sub: "Same core, new manifestations", fill: "transparent", stroke: accentVar, text: "var(--salon-ink)", accent: accentVar },
    { x: 40, y: 200, label: "Replaceable Skills", sub: "What AI can learn — even the ones you're proud of", fill: "transparent", stroke: alt, text: "var(--salon-ink)", accent: alt },
    { x: 400, y: 200, label: "Yet To Be Cultivated", sub: "Latent abilities you've postponed", fill: alt, text: "var(--salon-paper)", accent: alt },
  ];
  return (
    <figure className="my-2">
      <svg viewBox="0 0 720 380" className="w-full h-auto" role="img" aria-label="Identity Matrix: four quadrants — Enduring Essence, Evolving Expression, Replaceable Skills, Yet To Be Cultivated">
        {/* Axis labels */}
        <text x="360" y="22" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill="var(--salon-ink)" opacity="0.5" letterSpacing="3">
          CORE  →  SURFACE
        </text>
        <text x="20" y="170" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill="var(--salon-ink)" opacity="0.5" letterSpacing="3" transform="rotate(-90 20 170)">
          STABLE  →  GROWING
        </text>

        {/* Cells */}
        {cells.map((c, i) => (
          <g key={i}>
            <rect
              x={c.x}
              y={c.y}
              width="280"
              height="140"
              rx="14"
              fill={c.fill}
              stroke={c.stroke ?? c.accent}
              strokeWidth="2"
              opacity={c.fill === "transparent" ? 1 : 0.92}
            />
            <text
              x={c.x + 20}
              y={c.y + 38}
              fontFamily="var(--font-display), serif"
              fontSize="20"
              fontWeight="700"
              fill={c.text}
            >
              {c.label}
            </text>
            <text
              x={c.x + 20}
              y={c.y + 70}
              fontFamily="var(--font-sans), sans-serif"
              fontSize="12"
              fill={c.text}
              opacity="0.85"
            >
              <tspan x={c.x + 20} dy="0">{c.sub.split("—")[0]}</tspan>
              <tspan x={c.x + 20} dy="16">{c.sub.split("—")[1]?.trim() ?? ""}</tspan>
            </text>
            {/* Number badge */}
            <circle cx={c.x + 250} cy={c.y + 22} r="12" fill={c.text} opacity="0.15" />
            <text
              x={c.x + 250}
              y={c.y + 27}
              textAnchor="middle"
              fontFamily="var(--font-sans), sans-serif"
              fontSize="12"
              fontWeight="700"
              fill={c.accent}
            >
              {String(i + 1).padStart(2, "0")}
            </text>
          </g>
        ))}

        {/* Quadrant divider lines */}
        <line x1="360" y1="40" x2="360" y2="340" stroke="var(--salon-ink)" strokeWidth="1" strokeDasharray="3 4" opacity="0.25" />
        <line x1="40" y1="200" x2="680" y2="200" stroke="var(--salon-ink)" strokeWidth="1" strokeDasharray="3 4" opacity="0.25" />

        {/* Focus arrow toward bottom-right */}
        <g transform="translate(560 360)">
          <text textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fontWeight="700" fill={alt} letterSpacing="2">
            ↑ FOCUS GROWTH HERE
          </text>
        </g>
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        Be brutally honest. The insight lives in seeing the whole picture at once.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * 3. INTENT MAP
 *    A 2×2 grid: Values · Desired Outcomes · Guardrails · Metrics
 *    with arrows showing how the four quadrants interconnect.
 * ============================================================ */
function IntentMapDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  return (
    <figure className="my-2">
      <svg viewBox="0 0 720 440" className="w-full h-auto" role="img" aria-label="Intent Map: four quadrants — Values, Desired Outcomes, Guardrails, Metrics">
        {/* Quadrants */}
        {/* Top-left: Values */}
        <g>
          <rect x="40" y="60" width="300" height="150" rx="14" fill={accentVar} fillOpacity="0.12" stroke={accentVar} strokeWidth="2" />
          <text x="60" y="90" fontFamily="var(--font-display), serif" fontSize="20" fontWeight="700" fill={accentVar}>Values</text>
          <text x="60" y="120" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.75">
            <tspan x="60" dy="0">What you refuse to compromise,</tspan>
            <tspan x="60" dy="16">no matter the pressure.</tspan>
          </text>
          <text x="60" y="190" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={accentVar} letterSpacing="2" opacity="0.7">
            NON-NEGOTIABLES
          </text>
        </g>

        {/* Top-right: Desired Outcomes */}
        <g>
          <rect x="380" y="60" width="300" height="150" rx="14" fill={alt} fillOpacity="0.12" stroke={alt} strokeWidth="2" />
          <text x="400" y="90" fontFamily="var(--font-display), serif" fontSize="20" fontWeight="700" fill={alt}>Desired Outcomes</text>
          <text x="400" y="120" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.75">
            <tspan x="400" dy="0">The specific, concrete change</tspan>
            <tspan x="400" dy="16">you are seeking.</tspan>
          </text>
          <text x="400" y="190" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={alt} letterSpacing="2" opacity="0.7">
            WHAT SUCCESS LOOKS LIKE
          </text>
        </g>

        {/* Bottom-left: Guardrails */}
        <g>
          <rect x="40" y="240" width="300" height="150" rx="14" fill={accentVar} fillOpacity="0.12" stroke={accentVar} strokeWidth="2" />
          <text x="60" y="270" fontFamily="var(--font-display), serif" fontSize="20" fontWeight="700" fill={accentVar}>Guardrails</text>
          <text x="60" y="300" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.75">
            <tspan x="60" dy="0">Hard boundaries —</tspan>
            <tspan x="60" dy="16">what you absolutely won't do.</tspan>
          </text>
          <text x="60" y="370" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={accentVar} letterSpacing="2" opacity="0.7">
            NEVER DO THIS
          </text>
        </g>

        {/* Bottom-right: Metrics */}
        <g>
          <rect x="380" y="240" width="300" height="150" rx="14" fill={alt} fillOpacity="0.12" stroke={alt} strokeWidth="2" />
          <text x="400" y="270" fontFamily="var(--font-display), serif" fontSize="20" fontWeight="700" fill={alt}>Metrics</text>
          <text x="400" y="300" fontFamily="var(--font-sans), sans-serif" fontSize="12" fill="var(--salon-ink)" opacity="0.75">
            <tspan x="400" dy="0">How you'll measure what</tspan>
            <tspan x="400" dy="16">actually matters — not just counts.</tspan>
          </text>
          <text x="400" y="370" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={alt} letterSpacing="2" opacity="0.7">
            MEANING, NOT JUST NUMBERS
          </text>
        </g>

        {/* Connector arrows showing the cross-flow */}
        <defs>
          <marker id="im-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" fill="var(--salon-ink)" opacity="0.5" />
          </marker>
        </defs>
        {/* Values → Outcomes (top horizontal) */}
        <line x1="345" y1="135" x2="375" y2="135" stroke="var(--salon-ink)" strokeWidth="1.5" opacity="0.4" markerEnd="url(#im-arrow)" />
        {/* Guardrails → Metrics (bottom horizontal) */}
        <line x1="345" y1="315" x2="375" y2="315" stroke="var(--salon-ink)" strokeWidth="1.5" opacity="0.4" markerEnd="url(#im-arrow)" />
        {/* Values → Guardrails (left vertical) */}
        <line x1="190" y1="215" x2="190" y2="235" stroke="var(--salon-ink)" strokeWidth="1.5" opacity="0.4" markerEnd="url(#im-arrow)" />
        {/* Outcomes → Metrics (right vertical) */}
        <line x1="530" y1="215" x2="530" y2="235" stroke="var(--salon-ink)" strokeWidth="1.5" opacity="0.4" markerEnd="url(#im-arrow)" />

        {/* Header */}
        <text x="360" y="30" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill="var(--salon-ink)" opacity="0.5" letterSpacing="2">
          DRAW A SIMPLE GRID
        </text>
        <text x="360" y="420" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.5">
          Values without metrics are words · Metrics without values optimize for the wrong things.
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        Fill each quadrant in order, then review monthly.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * 4. COMMUNITY FLYWHEEL
 *    A circular flywheel: Spark → Structure → Scale → Sustain.
 * ============================================================ */
function CommunityFlywheelDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  const cx = 360;
  const cy = 220;
  const r = 140;

  const phases = [
    { angle: -90, label: "Spark", sub: "Recognition that others share your challenge", color: accentVar },
    { angle: 0, label: "Structure", sub: "Explicit agreements transform gathering into habit", color: alt },
    { angle: 90, label: "Scale", sub: "Authentic practice attracts the right people", color: accentVar },
    { angle: 180, label: "Sustain", sub: "Plan for evolution — communities outgrow their first shape", color: alt },
  ];

  return (
    <figure className="my-2">
      <svg viewBox="0 0 720 440" className="w-full h-auto" role="img" aria-label="Community Flywheel: four phases — Spark, Structure, Scale, Sustain — forming a self-reinforcing cycle">
        <defs>
          <marker id="cf-arrow" markerWidth="12" markerHeight="12" refX="6" refY="6" orient="auto">
            <path d="M0,0 L12,6 L0,12 Z" fill={accentVar} opacity="0.7" />
          </marker>
        </defs>

        {/* Outer cycle arrows (4 arcs around the circle) */}
        {phases.map((p, i) => {
          const next = phases[(i + 1) % 4];
          const startAngle = p.angle;
          const endAngle = next.angle;
          const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
          const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
          const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
          const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={accentVar}
              strokeWidth="3"
              strokeOpacity="0.5"
              markerEnd="url(#cf-arrow)"
            />
          );
        })}

        {/* Center hub */}
        <circle cx={cx} cy={cy} r="48" fill="var(--salon-mist)" stroke={accentVar} strokeWidth="2" strokeDasharray="2 4" />
        <text x={cx} y={cy - 8} textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill="var(--salon-ink)">
          FLYWHEEL
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="9" fill="var(--salon-ink)" opacity="0.6" letterSpacing="1.5">
          MOMENTUM
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="9" fill="var(--salon-ink)" opacity="0.6" letterSpacing="1.5">
          BUILDS EACH TURN
        </text>

        {/* Phase nodes */}
        {phases.map((p, i) => {
          const x = cx + r * Math.cos((p.angle * Math.PI) / 180);
          const y = cy + r * Math.sin((p.angle * Math.PI) / 180);
          // Label position pushed outward
          const lx = cx + (r + 70) * Math.cos((p.angle * Math.PI) / 180);
          const ly = cy + (r + 50) * Math.sin((p.angle * Math.PI) / 180);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="36" fill={p.color} opacity="0.95" />
              <text x={x} y={y + 5} textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill="var(--salon-paper)">
                {String(i + 1).padStart(2, "0")}
              </text>
              <text x={lx} y={ly - 8} textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="18" fontWeight="700" fill={p.color}>
                {p.label}
              </text>
              <text x={lx} y={ly + 12} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.7">
                <tspan x={lx} dy="0">{p.sub.split("—")[0]?.trim() ?? p.sub}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        Like a physical flywheel — each complete rotation makes the next easier.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * 5. POCKET CARD
 *    A wallet-card visual with 4 compass points:
 *    N: Curiosity · E: Intentionality · S: Clarity · W: Care
 * ============================================================ */
function PocketCardDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  return (
    <figure className="my-2">
      <svg viewBox="0 0 720 440" className="w-full h-auto" role="img" aria-label="Pocket Card: four compass points — Curiosity, Intentionality, Clarity, Care">
        <defs>
          <linearGradient id="pc-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--salon-paper)" />
            <stop offset="100%" stopColor="var(--salon-mist)" />
          </linearGradient>
        </defs>

        {/* Card body */}
        <rect x="100" y="40" width="520" height="360" rx="22" fill="url(#pc-bg)" stroke={accentVar} strokeWidth="3" />

        {/* Card header */}
        <text x="360" y="76" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-ink)">
          The Pocket Card
        </text>
        <text x="360" y="98" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={accentVar} letterSpacing="3">
          FOUR PRINCIPLES · COMPASS POINTS
        </text>

        {/* Divider line */}
        <line x1="160" y1="116" x2="560" y2="116" stroke={accentVar} strokeWidth="1" opacity="0.4" />

        {/* Compass layout — N top, E right, S bottom, W left */}
        {/* N — Curiosity */}
        <g>
          <circle cx="360" cy="170" r="32" fill={accentVar} opacity="0.92" />
          <text x="360" y="178" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-paper)">N</text>
          <text x="360" y="222" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="18" fontWeight="700" fill={accentVar}>
            Curiosity
          </text>
          <text x="360" y="244" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.7">
            Stay willing to be surprised.
          </text>
        </g>

        {/* E — Intentionality (right) */}
        <g>
          <circle cx="540" cy="240" r="32" fill={alt} opacity="0.92" />
          <text x="540" y="248" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-paper)">E</text>
          <text x="540" y="290" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill={alt}>
            Intentionality
          </text>
          <text x="540" y="308" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="10" fill="var(--salon-ink)" opacity="0.7">
            <tspan x="540" dy="0">Choose consciously,</tspan>
            <tspan x="540" dy="13">not by momentum.</tspan>
          </text>
        </g>

        {/* S — Clarity (bottom) */}
        <g>
          <circle cx="360" cy="330" r="32" fill={accentVar} opacity="0.92" />
          <text x="360" y="338" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-paper)">S</text>
          <text x="300" y="338" textAnchor="end" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill={accentVar}>
            Clarity
          </text>
          <text x="300" y="354" textAnchor="end" fontFamily="var(--font-sans), sans-serif" fontSize="10" fill="var(--salon-ink)" opacity="0.7">
            See what the model misses.
          </text>
        </g>

        {/* W — Care (left) */}
        <g>
          <circle cx="180" cy="240" r="32" fill={alt} opacity="0.92" />
          <text x="180" y="248" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="22" fontWeight="700" fill="var(--salon-paper)">W</text>
          <text x="180" y="290" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill={alt}>
            Care
          </text>
          <text x="180" y="308" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="10" fill="var(--salon-ink)" opacity="0.7">
            <tspan x="180" dy="0">Flourishing over</tspan>
            <tspan x="180" dy="13">pure optimization.</tspan>
          </text>
        </g>

        {/* Footer */}
        <text x="360" y="386" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="9" fill="var(--salon-ink)" opacity="0.5" letterSpacing="2">
          WALLET · DESK · MIRROR · LAPTOP
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        Print it. Laminate it. Carry it. Pull it out when pressure mounts.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * 6. PROMPT-SCAFFOLDING CANVAS
 *    A 2×2 grid: Frame · Fuel · Flip · Filter — each tied to a posture.
 * ============================================================ */
function PromptScaffoldingCanvasDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  const cells = [
    { x: 40, y: 60, label: "Frame", posture: "Intentionality", sub: "Why you're creating and for whom — the emotional core.", color: accentVar, postureColor: accentVar },
    { x: 380, y: 60, label: "Fuel", posture: "Curiosity", sub: "Feed unexpected combinations — references, moods, collisions.", color: alt, postureColor: alt },
    { x: 40, y: 230, label: "Flip", posture: "Clarity", sub: "Invert an assumption — what if the villain is the hero?", color: alt, postureColor: alt },
    { x: 380, y: 230, label: "Filter", posture: "Care", sub: "Practical & ethical boundaries — respects sources, opens possibilities.", color: accentVar, postureColor: accentVar },
  ];
  return (
    <figure className="my-2">
      <svg viewBox="0 0 720 440" className="w-full h-auto" role="img" aria-label="Prompt-Scaffolding Canvas: four quadrants — Frame, Fuel, Flip, Filter">
        {/* Title bar */}
        <text x="360" y="34" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="16" fontWeight="700" fill="var(--salon-ink)" opacity="0.6" letterSpacing="2">
          FOUR QUADRANTS TO GUIDE YOUR CONVERSATION
        </text>

        {/* Cells */}
        {cells.map((c, i) => (
          <g key={i}>
            <rect
              x={c.x}
              y={c.y}
              width="300"
              height="150"
              rx="14"
              fill={c.color}
              fillOpacity="0.10"
              stroke={c.color}
              strokeWidth="2"
            />
            {/* Big F letter */}
            <text
              x={c.x + 28}
              y={c.y + 60}
              fontFamily="var(--font-display), serif"
              fontSize="48"
              fontWeight="800"
              fill={c.color}
              opacity="0.85"
            >
              {c.label[0]}
            </text>
            {/* Label */}
            <text
              x={c.x + 90}
              y={c.y + 50}
              fontFamily="var(--font-display), serif"
              fontSize="22"
              fontWeight="700"
              fill="var(--salon-ink)"
            >
              {c.label}
            </text>
            {/* Posture tag */}
            <rect x={c.x + 90} y={c.y + 60} width={c.posture.length * 7 + 14} height="16" rx="8" fill={c.postureColor} />
            <text x={c.x + 90 + (c.posture.length * 7 + 14) / 2} y={c.y + 71} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill="var(--salon-paper)" letterSpacing="1">
              {c.posture.toUpperCase()}
            </text>
            {/* Sub */}
            <text x={c.x + 28} y={c.y + 105} fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.75">
              <tspan x={c.x + 28} dy="0">{c.sub.split("—")[0]?.trim() ?? c.sub}</tspan>
              <tspan x={c.x + 28} dy="14">{c.sub.split("—")[1]?.trim() ?? ""}</tspan>
            </text>
          </g>
        ))}

        {/* Center connecting node */}
        <circle cx="360" cy="205" r="14" fill="var(--salon-paper)" stroke={accentVar} strokeWidth="2" />
        <text x="360" y="210" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="10" fontWeight="700" fill={accentVar}>F⁴</text>

        {/* Footer hint */}
        <text x="360" y="418" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.5">
          Use the canvas to shape the full creative partnership — not just the opening prompt.
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        The four F's run a prompt through the four postures before you ever type it.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * 7. ROADMAP CANVAS
 *    A vertical stack of 5 elements: Purpose · Plays · Risks · Rituals · Metrics.
 *    With a 90-day cycle indicator.
 * ============================================================ */
function RoadmapCanvasDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  const steps = [
    { label: "Purpose", sub: "Why this transformation matters", color: accentVar },
    { label: "Plays", sub: "Three concrete 90-day experiments", color: alt },
    { label: "Risks", sub: "Honest assessment via the 4-Lens Scan", color: accentVar },
    { label: "Rituals", sub: "Practices that keep you grounded", color: alt },
    { label: "Metrics", sub: "Measuring meaning, not just numbers", color: accentVar },
  ];
  return (
    <figure className="my-2">
      <svg viewBox="0 0 720 460" className="w-full h-auto" role="img" aria-label="Roadmap Canvas: five elements — Purpose, Plays, Risks, Rituals, Metrics — across a 90-day cycle">
        {/* 90-day cycle indicator on the left */}
        <g>
          <line x1="60" y1="60" x2="60" y2="400" stroke={accentVar} strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
          <circle cx="60" cy="60" r="6" fill={accentVar} />
          <circle cx="60" cy="220" r="6" fill={accentVar} />
          <circle cx="60" cy="400" r="6" fill={accentVar} />
          <text x="40" y="64" textAnchor="end" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={accentVar} letterSpacing="1">DAY 1</text>
          <text x="40" y="224" textAnchor="end" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={accentVar} letterSpacing="1">DAY 45</text>
          <text x="40" y="404" textAnchor="end" fontFamily="var(--font-sans), sans-serif" fontSize="10" fontWeight="700" fill={accentVar} letterSpacing="1">DAY 90</text>
        </g>

        {/* Header */}
        <text x="380" y="34" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="16" fontWeight="700" fill="var(--salon-ink)" opacity="0.6" letterSpacing="2">
          FIVE ELEMENTS · EVOLVES WITH PRACTICE
        </text>

        {/* Steps */}
        {steps.map((s, i) => {
          const y = 60 + i * 70;
          return (
            <g key={i}>
              {/* Connector line */}
              {i < steps.length - 1 && (
                <line
                  x1="170"
                  y1={y + 50}
                  x2="170"
                  y2={y + 70}
                  stroke={s.color}
                  strokeWidth="2"
                  opacity="0.5"
                />
              )}
              {/* Number badge */}
              <circle cx="170" cy={y + 25} r="20" fill={s.color} opacity="0.92" />
              <text x="170" y={y + 32} textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="16" fontWeight="700" fill="var(--salon-paper)">
                {String(i + 1).padStart(2, "0")}
              </text>
              {/* Card */}
              <rect x="210" y={y} width="490" height="50" rx="10" fill={s.color} fillOpacity="0.08" stroke={s.color} strokeWidth="1.5" />
              <text x="230" y={y + 22} fontFamily="var(--font-display), serif" fontSize="18" fontWeight="700" fill={s.color}>
                {s.label}
              </text>
              <text x="230" y={y + 40} fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.7">
                {s.sub}
              </text>
            </g>
          );
        })}

        {/* Footer */}
        <text x="380" y="440" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.5">
          Draft v1.0 in 30 minutes — it's meant to be wrong. Update based on reality, not projection.
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        A living document, not a plan you perfect. The roadmap that changes your life is the one you start.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * 8. THE CURIOSITY LOOP
 *    A circular loop: Notice → Question → Experiment → Reflect.
 * ============================================================ */
function CuriosityLoopDiagram({ accentVar }: DiagramProps) {
  const alt = altAccent(accentVar);
  const cx = 360;
  const cy = 230;
  const r = 140;

  const nodes = [
    { angle: -90, label: "Notice", sub: "Observe your reaction", color: accentVar },
    { angle: 0, label: "Question", sub: "Challenge your assumptions", color: alt },
    { angle: 90, label: "Experiment", sub: "Take one small action", color: accentVar },
    { angle: 180, label: "Reflect", sub: "What surprised you?", color: alt },
  ];

  return (
    <figure className="my-2">
      <svg viewBox="0 0 720 460" className="w-full h-auto" role="img" aria-label="The Curiosity Loop: four movements — Notice, Question, Experiment, Reflect — forming a repeating cycle">
        <defs>
          <marker id="cl-arrow" markerWidth="14" markerHeight="14" refX="7" refY="7" orient="auto">
            <path d="M0,0 L14,7 L0,14 Z" fill={accentVar} opacity="0.75" />
          </marker>
        </defs>

        {/* Header */}
        <text x="360" y="32" textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="16" fontWeight="700" fill="var(--salon-ink)" opacity="0.6" letterSpacing="2">
          FOUR MOVEMENTS · REPEAT AS NEEDED
        </text>

        {/* Loop arrows (4 arcs) */}
        {nodes.map((n, i) => {
          const next = nodes[(i + 1) % 4];
          const x1 = cx + r * Math.cos((n.angle * Math.PI) / 180);
          const y1 = cy + r * Math.sin((n.angle * Math.PI) / 180);
          const x2 = cx + r * Math.cos((next.angle * Math.PI) / 180);
          const y2 = cy + r * Math.sin((next.angle * Math.PI) / 180);
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={accentVar}
              strokeWidth="3"
              strokeOpacity="0.55"
              markerEnd="url(#cl-arrow)"
            />
          );
        })}

        {/* Center hub */}
        <circle cx={cx} cy={cy} r="52" fill="var(--salon-mist)" stroke={accentVar} strokeWidth="2" strokeDasharray="2 4" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill="var(--salon-ink)">
          CURIOSITY
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="9" fill="var(--salon-ink)" opacity="0.6" letterSpacing="1.5">
          TURNS REACTION
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="9" fill="var(--salon-ink)" opacity="0.6" letterSpacing="1.5">
          INTO LEARNING
        </text>

        {/* Nodes */}
        {nodes.map((n, i) => {
          const x = cx + r * Math.cos((n.angle * Math.PI) / 180);
          const y = cy + r * Math.sin((n.angle * Math.PI) / 180);
          const lx = cx + (r + 80) * Math.cos((n.angle * Math.PI) / 180);
          const ly = cy + (r + 60) * Math.sin((n.angle * Math.PI) / 180);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="40" fill={n.color} opacity="0.95" />
              <text x={x} y={y + 7} textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="14" fontWeight="700" fill="var(--salon-paper)">
                {String(i + 1).padStart(2, "0")}
              </text>
              <text x={lx} y={ly - 4} textAnchor="middle" fontFamily="var(--font-display), serif" fontSize="20" fontWeight="700" fill={n.color}>
                {n.label}
              </text>
              <text x={lx} y={ly + 16} textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.7">
                {n.sub}
              </text>
            </g>
          );
        })}

        {/* Footer */}
        <text x="360" y="445" textAnchor="middle" fontFamily="var(--font-sans), sans-serif" fontSize="11" fill="var(--salon-ink)" opacity="0.5">
          The more you practice, the more natural curiosity becomes. Begin the loop again.
        </text>
      </svg>
      <figcaption className="text-xs text-muted-foreground text-center mt-3 italic">
        A practice, not a one-time exercise — each pass turns defensiveness into a question.
      </figcaption>
    </figure>
  );
}

/* ============================================================
 * REGISTRY
 * ============================================================ */
const DIAGRAMS: Record<string, (props: DiagramProps) => ReactElement> = {
  "human-qualities-spectrum": HumanQualitiesSpectrumDiagram,
  "identity-matrix": IdentityMatrixDiagram,
  "intent-map": IntentMapDiagram,
  "community-flywheel": CommunityFlywheelDiagram,
  "pocket-card": PocketCardDiagram,
  "prompt-scaffolding-canvas": PromptScaffoldingCanvasDiagram,
  "roadmap-canvas": RoadmapCanvasDiagram,
  "the-curiosity-loop": CuriosityLoopDiagram,
};

export function ToolDiagram({
  slug,
  accentVar,
}: {
  slug: string;
  accentVar: string;
}) {
  const Diagram = DIAGRAMS[slug];
  if (!Diagram) return null;
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <Diagram accentVar={accentVar} />
    </div>
  );
}

export function hasDiagram(slug: string): boolean {
  return slug in DIAGRAMS;
}
