import { sourceName } from "@/lib/client";

/**
 * Where something was played or liked, as a small round mark in the platform's color with a
 * letter: the same marks the connection list uses, at row size. Lettered on purpose; the
 * platforms' own logos are theirs.
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

/** The platform behind a send's via ("played:spotify", "spotify", "app") or a presence source. */
export function platformOfVia(via: string | null | undefined): string | null {
  if (!via || via === "app" || via === "none" || via === "imessage") return null;
  const k = via.startsWith("played:") ? via.slice(7) : via;
  return MARK[k] ? k : null;
}

export function SourceMark({ kind, size = 16, className }: { kind: string | null | undefined; size?: number; className?: string }) {
  if (!kind || !MARK[kind]) return null;
  const m = MARK[kind];
  const label = kind === "crate" ? "In Crate" : sourceName(kind);
  return (
    <span
      className={`srcmark${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, background: m.bg, fontSize: Math.round(size * (m.text.length > 1 ? 0.42 : 0.56)) }}
      title={label}
      aria-label={label}
      role="img"
    >
      {m.text}
    </span>
  );
}
