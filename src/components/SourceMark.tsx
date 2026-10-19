import { sourceName } from "@/lib/client";

/**
 * Where something was played or liked, as a small round mark in the platform's color with its
 * logo drawn in white: the same marks the connection list uses, at row size. Platforms without
 * a drawn logo get a letter.
 */
export const MARK: Record<string, { bg: string; text: string }> = {
  spotify: { bg: "#1db954", text: "S" },
  apple: { bg: "#fa2d48", text: "A" },
  youtube: { bg: "#ff0033", text: "Y" },
  soundcloud: { bg: "#ff5500", text: "SC" },
  tidal: { bg: "#1c1c1e", text: "T" },
  deezer: { bg: "#a238ff", text: "D" },
  amazon: { bg: "#1ab5b8", text: "AM" },
  pandora: { bg: "#3668ff", text: "P" },
  web: { bg: "#6b6b6b", text: "W" },
  lastfm: { bg: "#d51007", text: "L" },
  crate: { bg: "var(--accent)", text: "C" },
};

/** A diamond for TIDAL's mark: three across, one below the middle. */
const diamond = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`;

/** The logos, drawn in white on a 24-unit box; the colored circle around them is the mark. */
const GLYPH: Record<string, React.ReactNode> = {
  spotify: (
    <g fill="none" stroke="#fff" strokeLinecap="round">
      <path d="M6.2 9.6c3.9-1.3 8.8-1 12.2 1.1" strokeWidth="2.3" />
      <path d="M7.1 12.8c3.2-1 7.2-.7 10 .9" strokeWidth="1.9" />
      <path d="M8 15.7c2.5-.8 5.5-.6 7.7.7" strokeWidth="1.5" />
    </g>
  ),
  apple: (
    <path
      fill="#fff"
      d="M17 4.6a.7.7 0 0 0-.6-.1L8.9 6.2a.7.7 0 0 0-.5.7v8.3a2.9 2.9 0 1 0 1.3 2.4V9.7l6-1.4v5.1a2.9 2.9 0 1 0 1.3 2.4V5.2a.7.7 0 0 0 0-.6z"
    />
  ),
  youtube: <path fill="#fff" d="M9.6 8.2v7.6l6.6-3.8z" />,
  soundcloud: (
    <path
      fill="#fff"
      d="M8.2 17h8.4a2.9 2.9 0 0 0 .4-5.8 4.7 4.7 0 0 0-8.9-1.5A3.7 3.7 0 0 0 8.2 17zM6.6 17h1V11a4.4 4.4 0 0 0-1 .6zM5 17h1v-5a3.5 3.5 0 0 0-1 1.4z"
    />
  ),
  tidal: <path fill="#fff" d={[diamond(7.2, 10, 2.3), diamond(12, 10, 2.3), diamond(16.8, 10, 2.3), diamond(12, 14.8, 2.3)].join("")} />,
  lastfm: (
    <text x="12" y="15.6" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" fontFamily="var(--font-sans), sans-serif" letterSpacing="-0.3">
      as
    </text>
  ),
};

/** The platform behind a send's via ("played:spotify", "spotify", "app") or a presence source. */
export function platformOfVia(via: string | null | undefined): string | null {
  if (!via || via === "app" || via === "none" || via === "imessage") return null;
  const k = via.startsWith("played:") ? via.slice(7) : via;
  return MARK[k] ? k : null;
}

/** Just the logo (or letter), sized to sit inside a colored mark of about this size. */
export function SourceGlyph({ kind, size }: { kind: string; size: number }) {
  const g = GLYPH[kind];
  if (!g) {
    const text = MARK[kind]?.text ?? "?";
    return <span style={{ fontSize: Math.round(size * (text.length > 1 ? 0.42 : 0.56)) }}>{text}</span>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {g}
    </svg>
  );
}

export function SourceMark({ kind, size = 16, className }: { kind: string | null | undefined; size?: number; className?: string }) {
  if (!kind || !MARK[kind]) return null;
  const m = MARK[kind];
  const label = kind === "crate" ? "In Crate" : sourceName(kind);
  return (
    <span className={`srcmark${className ? ` ${className}` : ""}`} style={{ width: size, height: size, background: m.bg }} title={label} aria-label={label} role="img">
      <SourceGlyph kind={kind} size={size} />
    </span>
  );
}
