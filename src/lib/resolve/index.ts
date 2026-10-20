import { publicHttpUrl } from "../safe-url";
import {
  detectSource,
  cleanVideoTitle,
  looksOneOff,
  ONE_OFF_WORDS,
  parseSoundcloudTitle,
  parseSpotifyDescription,
  parseBandcampTitle,
  metaContent,
  decodeEntities,
  type SourceInfo,
  type Platform,
} from "./parse";
import { lookupApple, matchApple, type CatalogTrack } from "./itunes";
import { lookupDeezer, matchDeezer } from "./deezer";
import { buildLinks, type Links, type PlatformKey } from "./links";
import { accentFromImage } from "./color";

export type ResolvedTrack = {
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  appleId: string | null;
  genre: string | null;
  durationMs: number | null;
  year: number | null;
  links: Links;
  accent: string | null;
  sourcePlatform: Platform;
  sourceUrl: string;
  /** True when the track was matched to a catalog entry (artwork, preview, metadata are trustworthy). */
  resolved: boolean;
};

type Hints = {
  artist?: string;
  title?: string;
  album?: string;
  year?: number;
  thumb?: string;
  previewUrl?: string;
  direct: Partial<Record<PlatformKey, string>>;
  /** The video title says cover / edit / bootleg / mix: do not let the catalog stand in for it. */
  oneOff?: boolean;
  rawTitle?: string;
};

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  // Pasted links are fetched only when they point at the public web; the catalog hosts pass the same gate.
  if (!(await publicHttpUrl(url))) throw new Error("Not a public web address");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "manual", cache: "no-store" }).then(async (r) => {
      // One hop of redirect, checked the same way; link shorteners need it, private hops do not get it.
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const to = r.headers.get("location");
        const next = to ? new URL(to, url).toString() : null;
        if (next && (await publicHttpUrl(next))) return fetch(next, { ...init, signal: ctrl.signal, redirect: "manual", cache: "no-store" });
      }
      return r;
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetchWithTimeout(url, { headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*" } });
    if (!r.ok) return null;
    const text = await r.text();
    return text.length > 2_000_000 ? text.slice(0, 2_000_000) : text;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetchWithTimeout(url, { headers: { "user-agent": BROWSER_UA, accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

async function hintsFor(src: SourceInfo): Promise<{ hints: Hints; catalog: CatalogTrack | null }> {
  const hints: Hints = { direct: {} };
  let catalog: CatalogTrack | null = null;

  switch (src.platform) {
    case "apple": {
      hints.direct.apple = src.url;
      if (src.id) {
        try {
          catalog = await lookupApple(src.id);
        } catch {
          catalog = null;
        }
      }
      if (!catalog) {
        const html = await fetchText(src.url);
        if (html) {
          const t = metaContent(html, "og:title") ?? titleTag(html);
          if (t) {
            // "Archangel by Burial on Apple Music" / "Archangel - Song by Burial - Apple Music"
            const m = t.match(/^(.+?)\s+(?:-\s+song\s+)?by\s+(.+?)(?:\s+(?:on|-)\s+apple music)?$/i);
            if (m) {
              hints.title = m[1].trim();
              hints.artist = m[2].trim();
            } else Object.assign(hints, cleanVideoTitle(t));
          }
          hints.thumb = metaContent(html, "og:image") ?? undefined;
        }
      }
      break;
    }
    case "spotify": {
      hints.direct.spotify = src.url;
      const html = await fetchText(src.url);
      let got = false;
      if (html) {
        const t = metaContent(html, "og:title");
        const d = metaContent(html, "og:description") ?? metaContent(html, "twitter:description");
        if (t) {
          hints.title = t;
          got = true;
          if (d) {
            const p = parseSpotifyDescription(d);
            hints.artist = p.artist;
            hints.album = p.album;
            hints.year = p.year;
          }
          hints.thumb = metaContent(html, "og:image") ?? undefined;
        }
      }
      if (!got) {
        const o = await fetchJson<{ title?: string; thumbnail_url?: string }>(`https://open.spotify.com/oembed?url=${encodeURIComponent(src.url)}`);
        if (o?.title) {
          hints.title = o.title;
          hints.thumb = o.thumbnail_url;
        }
      }
      break;
    }
    case "youtube": {
      hints.direct.youtube = src.url;
      const o = await fetchJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(src.url)}&format=json`,
      );
      if (o?.title) {
        Object.assign(hints, cleanVideoTitle(o.title, o.author_name));
        hints.thumb = o.thumbnail_url;
        hints.rawTitle = o.title;
        hints.oneOff = looksOneOff(o.title);
      }
      break;
    }
    case "soundcloud": {
      hints.direct.soundcloud = src.url;
      const o = await fetchJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
        `https://soundcloud.com/oembed?url=${encodeURIComponent(src.url)}&format=json`,
      );
      if (o?.title) {
        const p = parseSoundcloudTitle(o.title);
        hints.title = p.title;
        hints.artist = p.artist ?? o.author_name;
        hints.thumb = o.thumbnail_url;
      } else if (src.slugTitle) {
        hints.title = src.slugTitle;
        hints.artist = src.slugArtist;
      }
      break;
    }
    case "bandcamp": {
      hints.direct.bandcamp = src.url;
      const html = await fetchText(src.url);
      const t = html ? metaContent(html, "og:title") : null;
      if (t && !/client challenge/i.test(t)) {
        Object.assign(hints, parseBandcampTitle(t));
        hints.thumb = (html && metaContent(html, "og:image")) ?? undefined;
      } else {
        hints.title = src.slugTitle;
        hints.artist = src.slugArtist;
      }
      break;
    }
    case "beatport": {
      hints.direct.beatport = src.url;
      const html = await fetchText(src.url);
      const t = html ? (metaContent(html, "og:title") ?? titleTag(html)) : null;
      if (t && !/just a moment|access denied/i.test(t)) {
        // "Title by Artist on Beatport" / "Title (Original Mix) - Artist | Beatport"
        const m = t.match(/^(.+?)\s+by\s+(.+?)(?:\s+on beatport)?$/i);
        if (m) {
          hints.title = m[1].trim();
          hints.artist = m[2].trim();
        } else Object.assign(hints, cleanVideoTitle(t.replace(/\s*[|\-]\s*beatport$/i, "")));
      } else {
        hints.title = src.slugTitle;
      }
      break;
    }
    case "deezer": {
      hints.direct.deezer = src.url;
      if (src.id) {
        const d = await lookupDeezer(src.id).catch(() => null);
        if (d) {
          hints.artist = d.artist;
          hints.title = d.title;
          hints.album = d.album ?? undefined;
          hints.thumb = d.artworkUrl ?? undefined;
          hints.previewUrl = d.previewUrl ?? undefined;
        }
      }
      break;
    }
    case "tidal": {
      hints.direct.tidal = src.url;
      const html = await fetchText(src.url);
      const t = html ? (metaContent(html, "og:title") ?? titleTag(html)) : null;
      if (t) {
        const m = t.match(/^(.+?)\s+by\s+(.+?)(?:\s+on tidal)?$/i);
        if (m) {
          hints.title = m[1].trim();
          hints.artist = m[2].trim();
        } else Object.assign(hints, cleanVideoTitle(t.replace(/\s*[|\-]\s*tidal$/i, "")));
        hints.thumb = (html && metaContent(html, "og:image")) ?? undefined;
      }
      break;
    }
    default: {
      const html = await fetchText(src.url);
      if (html) {
        const t = metaContent(html, "og:title") ?? titleTag(html);
        if (t) Object.assign(hints, cleanVideoTitle(t));
        hints.thumb = metaContent(html, "og:image") ?? undefined;
      }
    }
  }
  return { hints, catalog };
}

export async function resolveUrl(raw: string): Promise<ResolvedTrack> {
  const src = detectSource(raw);
  const { hints, catalog: fromLookup } = await hintsFor(src);

  let catalog = fromLookup;
  const video = src.platform === "youtube";
  if (!catalog && hints.title) {
    catalog = await matchApple(hints.artist, hints.title, { strict: video }).catch(() => null);
  }
  // A cover, edit or bootleg on YouTube is its own thing: keep the catalog out unless the
  // catalog's own title carries the same version word (a released remix, say).
  if (catalog && video && hints.oneOff && hints.rawTitle) {
    const word = (hints.rawTitle.match(ONE_OFF_WORDS) ?? [])[0]?.toLowerCase();
    if (word && !catalog.title.toLowerCase().includes(word)) catalog = null;
  }
  const videoOnly = video && !catalog;

  let artist = catalog?.artist ?? hints.artist ?? "";
  let title = catalog?.title ?? hints.title ?? "";
  if (!title) {
    // Nothing usable: keep the URL readable rather than failing the send.
    title = src.url.replace(/^https?:\/\//, "").slice(0, 80);
    artist = artist || "";
  }

  let previewUrl = catalog?.previewUrl ?? hints.previewUrl ?? null;
  // The link's own artwork is the right one for that release (Spotify, SoundCloud, Bandcamp,
  // Deezer, Tidal all serve square art); the catalog's art can belong to a different pressing.
  // YouTube thumbnails are video frames, so there the catalog art wins.
  const sourceArtIsCanonical = ["spotify", "soundcloud", "bandcamp", "deezer", "tidal", "beatport"].includes(src.platform);
  let artworkUrl = (sourceArtIsCanonical && hints.thumb) || catalog?.artworkUrl || hints.thumb || null;
  const direct = { ...hints.direct };
  if (catalog?.appleUrl) direct.apple = catalog.appleUrl;

  if (!previewUrl && title && !videoOnly) {
    const d = await matchDeezer(artist || undefined, title).catch(() => null);
    if (d) {
      previewUrl = d.previewUrl;
      artworkUrl = artworkUrl ?? d.artworkUrl;
      if (d.deezerUrl) direct.deezer = d.deezerUrl;
    }
  }

  const links = buildLinks(artist, title, direct);
  const accent = artworkUrl ? await accentFromImage(artworkUrl) : null;

  return {
    artist,
    title,
    album: catalog?.album ?? hints.album ?? null,
    artworkUrl,
    previewUrl,
    appleId: catalog?.appleId ?? null,
    genre: catalog?.genre ?? null,
    durationMs: catalog?.durationMs ?? null,
    year: catalog?.year ?? hints.year ?? null,
    links,
    accent,
    sourcePlatform: src.platform,
    sourceUrl: src.url,
    resolved: !!catalog,
  };
}

/** Resolves a catalog pick (from search) without a source URL. */
export async function resolveAppleId(appleId: string): Promise<ResolvedTrack | null> {
  const t = await lookupApple(appleId).catch(() => null);
  if (!t) return null;
  const url = t.appleUrl ?? `https://music.apple.com/us/song/${appleId}`;
  return resolveUrl(url);
}

export type TrackMeta = {
  artist: string;
  title: string;
  album?: string | null;
  artworkUrl?: string | null;
  previewUrl?: string | null;
  durationMs?: number | null;
  year?: number | null;
  appleId?: string | null;
  direct?: Partial<Record<PlatformKey, string>>;
  sourcePlatform: Platform;
  sourceUrl: string;
};

/**
 * Resolves a track we already know by name (from a connected source) without touching
 * the source URL: catalog match for preview and canonical names, links, accent.
 */
export async function resolveFromMeta(m: TrackMeta): Promise<ResolvedTrack> {
  let catalog: CatalogTrack | null = null;
  if (m.appleId) catalog = await lookupApple(m.appleId).catch(() => null);
  if (!catalog && m.title) catalog = await matchApple(m.artist || undefined, m.title).catch(() => null);

  const artist = catalog?.artist ?? m.artist ?? "";
  const title = catalog?.title ?? m.title ?? "";
  let previewUrl = m.previewUrl ?? catalog?.previewUrl ?? null;
  let artworkUrl = m.artworkUrl ?? catalog?.artworkUrl ?? null;
  const direct = { ...(m.direct ?? {}) };
  if (catalog?.appleUrl && !direct.apple) direct.apple = catalog.appleUrl;

  if (!previewUrl && title) {
    const d = await matchDeezer(artist || undefined, title).catch(() => null);
    if (d) {
      previewUrl = d.previewUrl;
      artworkUrl = artworkUrl ?? d.artworkUrl;
      if (d.deezerUrl) direct.deezer = d.deezerUrl;
    }
  }

  const links = buildLinks(artist, title, direct);
  const accent = artworkUrl ? await accentFromImage(artworkUrl) : null;
  return {
    artist,
    title,
    album: catalog?.album ?? m.album ?? null,
    artworkUrl,
    previewUrl,
    appleId: catalog?.appleId ?? m.appleId ?? null,
    genre: catalog?.genre ?? null,
    durationMs: catalog?.durationMs ?? m.durationMs ?? null,
    year: catalog?.year ?? m.year ?? null,
    links,
    accent,
    sourcePlatform: m.sourcePlatform,
    sourceUrl: m.sourceUrl,
    resolved: !!catalog,
  };
}
