import { createRenderer, defineComponents } from "mountly-json-render";
import { catalog } from "./catalog.js";

function sparklinePath(points: number[], w: number, h: number, pad = 2) {
  if (points.length < 2) return { line: "", area: "" };
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (p - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0]},${h} L${xy[0][0]},${h} Z`;
  return { line, area };
}

const TREND_GLYPH = { up: "▲", down: "▼", flat: "—" } as const;

/**
 * Native React implementations for the catalog. Defined once (typed against the
 * catalog, so `element.props` infers), reused by the MCP widget and the native
 * streaming preview. Class names map to the design tokens in `styles.css`.
 */
export const components = defineComponents(catalog, {
  Stack: ({ element, children }) => (
    <div className="gv-stack" style={{ gap: element.props.gap ?? 16 }}>
      {children}
    </div>
  ),
  Row: ({ element, children }) => (
    <div
      className="gv-row"
      style={{
        gap: element.props.gap ?? 16,
        flexWrap: element.props.wrap ? "wrap" : "nowrap",
      }}
    >
      {children}
    </div>
  ),
  Card: ({ element, children }) => (
    <section className={`gv-card${element.props.accent ? " gv-card--accent" : ""}`}>
      {element.props.title ? (
        <h3 className="gv-card-title">{element.props.title}</h3>
      ) : null}
      {children}
    </section>
  ),
  Heading: ({ element }) => <h2 className="gv-heading">{element.props.text}</h2>,
  Text: ({ element }) => (
    <p className={`gv-text${element.props.muted ? " gv-text--muted" : ""}`}>
      {element.props.text}
    </p>
  ),
  Stat: ({ element }) => {
    const { label, value, trend, delta } = element.props;
    return (
      <div className="gv-stat">
        <span className="gv-stat-label">{label}</span>
        <span className="gv-stat-value">{value}</span>
        {trend ? (
          <span className={`gv-stat-trend gv-trend--${trend}`}>
            {TREND_GLYPH[trend]} {delta ?? ""}
          </span>
        ) : null}
      </div>
    );
  },
  Badge: ({ element }) => (
    <span className={`gv-badge gv-badge--${element.props.tone ?? "neutral"}`}>
      {element.props.text}
    </span>
  ),
  Sparkline: ({ element }) => {
    const tone = element.props.tone ?? "accent";
    const color =
      tone === "positive"
        ? "var(--pos)"
        : tone === "danger"
          ? "var(--neg)"
          : "var(--accent)";
    const { line, area } = sparklinePath(element.props.points, 100, 40);
    const id = `sg-${tone}`;
    return (
      <svg className="gv-sparkline" viewBox="0 0 100 40" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  },
  Divider: () => <hr className="gv-divider" />,
  // Emit BOTH `press` and `click` so whichever the model binds resolves.
  Button: ({ element, emit }) => (
    <button
      type="button"
      className={`gv-button gv-button--${element.props.variant ?? "primary"}`}
      onClick={() => {
        emit("press");
        emit("click");
      }}
    >
      {element.props.label}
    </button>
  ),
});

/** Native (non-MCP) renderer for the same catalog — used by the streaming preview. */
export const GeneratedUI = createRenderer(catalog, components);
