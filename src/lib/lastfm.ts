import { getKeys } from "./keys";

/** Optional: a member's most-played tracks this week, from Last.fm. Needs a Last.fm API key. */
export type OnRepeatTrack = { artist: string; title: string; artworkUrl: string | null; plays: number };

export async function topTracksThisWeek(username: string): Promise<OnRepeatTrack[] | null> {
  const key = (await getKeys()).LASTFM_API_KEY;
  if (!key || !username) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(
      `https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${encodeURIComponent(username)}&period=7day&limit=5&api_key=${key}&format=json`,
      { signal: ctrl.signal, cache: "no-store" },
    );
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      toptracks?: { track?: Array<{ name: string; playcount: string; artist: { name: string }; image?: Array<{ "#text": string; size: string }> }> };
    };
    const list = j.toptracks?.track ?? [];
    return list.map((x) => ({
      artist: x.artist?.name ?? "",
      title: x.name,
      artworkUrl: x.image?.find((i) => i.size === "large")?.["#text"] || null,
      plays: Number(x.playcount) || 0,
    }));
  } catch {
    return null;
  }
}
