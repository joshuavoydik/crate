import { similarity } from "./parse";

/** Deezer's public API needs no key and offers 30-second MP3 previews; used as a fallback. */
export type DeezerTrack = {
  id: string;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  deezerUrl: string | null;
  durationMs: number | null;
};

type DzTrack = {
  id?: number;
  title?: string;
  link?: string;
  duration?: number;
  preview?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_xl?: string; cover_big?: string };
};

function toTrack(t: DzTrack): DeezerTrack | null {
  if (!t.id || !t.title || !t.artist?.name) return null;
  return {
    id: String(t.id),
    artist: t.artist.name,
    title: t.title,
    album: t.album?.title ?? null,
    artworkUrl: t.album?.cover_xl ?? t.album?.cover_big ?? null,
    previewUrl: t.preview || null,
    deezerUrl: t.link ?? null,
    durationMs: t.duration ? t.duration * 1000 : null,
  };
}

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function lookupDeezer(id: string): Promise<DeezerTrack | null> {
  const j = (await getJson(`https://api.deezer.com/track/${encodeURIComponent(id)}`)) as DzTrack;
  return toTrack(j);
}

export async function matchDeezer(artist: string | undefined, title: string): Promise<DeezerTrack | null> {
  // Plain-text search; Deezer's field syntax returns nothing for many queries.
  const q = artist ? `${artist} ${title}` : title;
  const j = (await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`)) as {
    data?: DzTrack[];
  };
  let best: { t: DeezerTrack; s: number } | null = null;
  for (const raw of j.data ?? []) {
    const t = toTrack(raw);
    if (!t) continue;
    const s = similarity(t.title, title) * 0.6 + (artist ? similarity(t.artist, artist) : 0.5) * 0.4;
    if (!best || s > best.s) best = { t, s };
  }
  return best && best.s >= 0.45 ? best.t : null;
}
