import type { TrackMeta } from "../resolve";

export type SourceKind = "spotify" | "youtube" | "apple" | "soundcloud" | "tidal" | "lastfm";

export const SOURCE_LABELS: Record<SourceKind, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  apple: "Apple Music",
  soundcloud: "SoundCloud",
  tidal: "TIDAL",
  lastfm: "Last.fm",
};

export type SourceItem = {
  /** Stable id from the source, so a re-sync never duplicates. */
  externalId: string;
  action: "liked" | "played";
  at: number;
  meta: TrackMeta;
};

export type Token = Record<string, unknown>;
export type Cursor = Record<string, unknown>;

export type SyncContext = {
  token: Token | null;
  cursor: Cursor;
  /** Username for sources that need no OAuth (Last.fm). */
  label: string | null;
};

export type SyncResult = {
  /** Newest first. The engine processes the newest few and ignores the long tail on a first sync. */
  items: SourceItem[];
  cursor: Cursor;
  /** A refreshed token to store, when the provider rotated it. */
  token?: Token;
};

export interface Provider {
  kind: SourceKind;
  sync(ctx: SyncContext): Promise<SyncResult>;
}

export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`${r.status} from ${new URL(url).hostname}${body ? `: ${body.slice(0, 160)}` : ""}`);
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** ISO 8601 duration (PT3M33S) to milliseconds. */
export function isoDurationMs(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return ((Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60 + Number(m[3] || 0)) * 1000;
}
