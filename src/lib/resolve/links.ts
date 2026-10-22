/**
 * Builds a link for every platform from artist + title.
 * Direct links are used where we have them; otherwise a search link on that platform,
 * which lands on the track for nearly every released song. No imports.
 */

export type PlatformKey = "apple" | "spotify" | "youtube" | "youtubeMusic" | "soundcloud" | "bandcamp" | "beatport" | "tidal" | "deezer";

export type Links = Partial<Record<PlatformKey, { url: string; direct: boolean }>>;

export const PLATFORM_LABELS: Record<PlatformKey, string> = {
  apple: "Apple Music",
  spotify: "Spotify",
  youtube: "YouTube",
  youtubeMusic: "YouTube Music",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
  beatport: "Beatport",
  tidal: "Tidal",
  deezer: "Deezer",
};

export const BUY_PLATFORMS: PlatformKey[] = ["bandcamp", "beatport"];

export function buildLinks(artist: string, title: string, direct: Partial<Record<PlatformKey, string>> = {}): Links {
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  const search: Record<PlatformKey, string> = {
    apple: `https://music.apple.com/us/search?term=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    youtubeMusic: `https://music.youtube.com/search?q=${q}`,
    soundcloud: `https://soundcloud.com/search?q=${q}`,
    bandcamp: `https://bandcamp.com/search?q=${q}&item_type=t`,
    beatport: `https://www.beatport.com/search?q=${q}`,
    tidal: `https://listen.tidal.com/search?q=${q}`,
    deezer: `https://www.deezer.com/search/${q}`,
  };
  const out: Links = {};
  for (const key of Object.keys(search) as PlatformKey[]) {
    const d = direct[key];
    out[key] = d ? { url: d, direct: true } : { url: search[key], direct: false };
  }
  return out;
}

const BASE_ORDER: PlatformKey[] = ["apple", "spotify", "youtube", "soundcloud", "bandcamp", "beatport", "tidal", "youtubeMusic", "deezer"];

/**
 * The order platforms are shown in. Takes one preference or a ranked list of hints (the viewer's
 * chosen platform, then where they actually listen, then where the track came from); unknown or
 * empty hints are skipped and the catalog order fills in the rest.
 */
export function orderPlatforms(preferred: string | null | undefined | Array<string | null | undefined>): PlatformKey[] {
  const hints = (Array.isArray(preferred) ? preferred : [preferred]).map((h) => platformKeyOf(h)).filter((h): h is PlatformKey => !!h);
  const out: PlatformKey[] = [];
  for (const k of [...hints, ...BASE_ORDER]) if (!out.includes(k)) out.push(k);
  return out;
}

/** The platform a source URL lives on, as a link key, when it is one we list. */
export function platformKeyOf(platform: string | null | undefined): PlatformKey | null {
  const map: Record<string, PlatformKey> = {
    apple: "apple",
    spotify: "spotify",
    youtube: "youtube",
    youtubemusic: "youtubeMusic",
    soundcloud: "soundcloud",
    bandcamp: "bandcamp",
    beatport: "beatport",
    tidal: "tidal",
    deezer: "deezer",
  };
  return platform ? (map[platform.toLowerCase()] ?? null) : null;
}

/**
 * Where a track can actually be opened, in the viewer's order: direct links first, then a
 * search on each remaining platform. A track that only exists on one platform (a YouTube cover,
 * a SoundCloud upload) gets that as its one real place and the rest as plain searches.
 */
export function openable(links: Links, preferred: string | null | undefined | Array<string | null | undefined>): { direct: PlatformKey[]; search: PlatformKey[] } {
  const order = orderPlatforms(preferred);
  return {
    direct: order.filter((k) => links[k]?.direct),
    search: order.filter((k) => links[k] && !links[k]!.direct),
  };
}
