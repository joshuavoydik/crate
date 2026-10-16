import { getJson, type Provider, type SourceItem } from "./types";
import { getKeys } from "../keys";

/** Last.fm: a username plus an API key. Recent tracks are plays, loved tracks are likes. */
export async function lastfmConfigured(): Promise<boolean> {
  return !!(await getKeys()).LASTFM_API_KEY;
}

type Recent = {
  recenttracks?: {
    track?: Array<{
      name: string;
      artist: { "#text": string };
      album?: { "#text": string };
      url?: string;
      date?: { uts: string };
      image?: Array<{ "#text": string; size: string }>;
      "@attr"?: { nowplaying?: string };
    }>;
  };
};
type Loved = { lovedtracks?: { track?: Array<{ name: string; artist: { name: string }; url?: string; date?: { uts: string } }> } };

export type LastfmNow = { artist: string; title: string; album: string | null; artworkUrl: string | null; url: string };

/** Pure: the "now playing" entry from a recent-tracks payload, if Last.fm is reporting one. */
export function nowPlayingFromRecent(j: Recent | null | undefined): LastfmNow | null {
  const t = j?.recenttracks?.track?.find((x) => x["@attr"]?.nowplaying === "true");
  if (!t) return null;
  return {
    artist: t.artist["#text"],
    title: t.name,
    album: t.album?.["#text"] || null,
    artworkUrl: t.image?.find((i) => i.size === "extralarge")?.["#text"] || null,
    url: t.url ?? "https://www.last.fm",
  };
}

export async function lastfmNowPlaying(username: string): Promise<LastfmNow | null> {
  const key = (await getKeys()).LASTFM_API_KEY;
  if (!key) return null;
  const j = await getJson<Recent>(
    `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(username)}&limit=1&api_key=${key}&format=json`,
    {},
    5000,
  );
  return nowPlayingFromRecent(j);
}

export const lastfm: Provider = {
  kind: "lastfm",
  async sync({ label, cursor }) {
    if (!label) throw new Error("Last.fm username is missing");
    const key = (await getKeys()).LASTFM_API_KEY;
    if (!key) throw new Error("Last.fm API key is missing");
    const u = encodeURIComponent(label);
    const since = typeof cursor.playTs === "number" ? cursor.playTs : 0;
    const sinceLove = typeof cursor.loveTs === "number" ? cursor.loveTs : 0;
    const first = !since;
    const recent = await getJson<Recent>(
      `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${u}&limit=${first ? 25 : 100}${since ? `&from=${since + 1}` : ""}&api_key=${key}&format=json`,
    );
    const loved = await getJson<Loved>(
      `https://ws.audioscrobbler.com/2.0/?method=user.getlovedtracks&user=${u}&limit=${first ? 25 : 100}&api_key=${key}&format=json`,
    );
    const items: SourceItem[] = [];
    for (const t of recent.recenttracks?.track ?? []) {
      if (t["@attr"]?.nowplaying || !t.date?.uts) continue;
      const ts = Number(t.date.uts);
      if (ts <= since) continue;
      items.push({
        externalId: `${ts}:${t.name}`,
        action: "played",
        at: ts * 1000,
        meta: {
          artist: t.artist["#text"],
          title: t.name,
          album: t.album?.["#text"] || null,
          artworkUrl: t.image?.find((i) => i.size === "extralarge")?.["#text"] || null,
          direct: {},
          sourcePlatform: "unknown",
          sourceUrl: t.url ?? "https://www.last.fm",
        },
      });
    }
    for (const t of loved.lovedtracks?.track ?? []) {
      const ts = Number(t.date?.uts ?? 0);
      if (!ts || ts <= sinceLove) continue;
      items.push({
        externalId: `${t.artist.name}:${t.name}`,
        action: "liked",
        at: ts * 1000,
        meta: { artist: t.artist.name, title: t.name, direct: {}, sourcePlatform: "unknown", sourceUrl: t.url ?? "https://www.last.fm" },
      });
    }
    items.sort((a, b) => b.at - a.at);
    const playTs = Math.max(since, ...items.filter((i) => i.action === "played").map((i) => Math.floor(i.at / 1000)));
    const loveTs = Math.max(sinceLove, ...items.filter((i) => i.action === "liked").map((i) => Math.floor(i.at / 1000)));
    return { items, cursor: { playTs, loveTs } };
  },
};
