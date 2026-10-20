"use client";

/** Thin fetch wrapper for the app's own API. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const r = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) }, body, cache: "no-store" });
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${r.status})`;
    // Signed out elsewhere (another tab, a cleared cookie): this tab goes back to the door instead of showing raw errors.
    if (r.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/join") && !path.startsWith("/api/crews")) {
      window.location.assign("/?signedout=1");
    }
    throw new ApiError(msg, r.status);
  }
  return data as T;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function formatDuration(ms: number | null | undefined): string | null {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Up to two initials, one whole character each, so an emoji or an accented letter never splits into garbage. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]!.toUpperCase())
    .join("");
}

const CREW_KEY = "crate:crew";

export function loadCrewId(): string | null {
  try {
    return localStorage.getItem(CREW_KEY);
  } catch {
    return null;
  }
}

export function storeCrewId(id: string): void {
  try {
    localStorage.setItem(CREW_KEY, id);
  } catch {
    /* private mode */
  }
}

export function flag(key: string): boolean {
  try {
    return localStorage.getItem(`crate:${key}`) === "1";
  } catch {
    return false;
  }
}

export function setFlag(key: string): void {
  try {
    localStorage.setItem(`crate:${key}`, "1");
  } catch {
    /* ignore */
  }
}

const SOURCE_NAMES: Record<string, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  apple: "Apple Music",
  soundcloud: "SoundCloud",
  tidal: "TIDAL",
  deezer: "Deezer",
  amazon: "Amazon Music",
  pandora: "Pandora",
  web: "the web",
  lastfm: "Last.fm",
  imessage: "iMessage",
};

/** The Crate Chrome extension id (fixed by the key in its manifest), for the Connect link. */
export const CHROME_EXTENSION_ID = "kbmgnegbbfcmabejaacgoimcdlklmdin";

export function sourceName(kind: string): string {
  return SOURCE_NAMES[kind] ?? kind;
}

/** A short phrase for where a card came from, or null for an ordinary send. */
export function viaLabel(via: string | null | undefined): string | null {
  if (!via || via === "app") return null;
  if (via === "imessage") return "via iMessage";
  if (via.startsWith("played:")) return `played on ${sourceName(via.slice(7))}`;
  if (via === "lastfm") return `loved on ${sourceName(via)}`;
  return `liked on ${sourceName(via)}`;
}
