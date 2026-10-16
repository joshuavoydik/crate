/**
 * Pure helpers for understanding music links and messy titles.
 * No imports, so this file can be unit-tested directly in Node.
 */

export type Platform = "spotify" | "apple" | "youtube" | "soundcloud" | "bandcamp" | "beatport" | "tidal" | "deezer" | "unknown";

export type SourceInfo = {
  platform: Platform;
  url: string;
  /** Platform-specific id when the URL carries one. */
  id?: string;
  /** Best guess at artist/title from the URL itself (slugs), used as a last resort. */
  slugArtist?: string;
  slugTitle?: string;
};

export type ArtistTitle = { artist?: string; title: string };

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

/** Pulls the first http(s) URL out of free text (share sheets send title + text + url). */
export function extractUrl(...parts: Array<string | null | undefined>): string | null {
  for (const p of parts) {
    if (!p) continue;
    const m = p.match(URL_RE);
    if (m) return m[0].replace(/[.,;:!?]+$/, "");
  }
  return null;
}

function slugToWords(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSource(raw: string): SourceInfo {
  // spotify:track:ID URIs
  const uri = raw.trim().match(/^spotify:track:([A-Za-z0-9]+)$/);
  if (uri) return { platform: "spotify", url: `https://open.spotify.com/track/${uri[1]}`, id: uri[1] };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { platform: "unknown", url: raw.trim() };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { platform: "unknown", url: raw.trim() };
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname;
  const segs = path.split("/").filter(Boolean);

  if (host === "open.spotify.com" || host === "spotify.link") {
    const i = segs.indexOf("track");
    if (i >= 0 && segs[i + 1]) return { platform: "spotify", url: url.toString(), id: segs[i + 1] };
    return { platform: "spotify", url: url.toString() };
  }
  if (host === "music.apple.com" || host === "itunes.apple.com" || host === "geo.music.apple.com") {
    const i = url.searchParams.get("i");
    if (i) return { platform: "apple", url: url.toString(), id: i };
    const songIdx = segs.indexOf("song");
    if (songIdx >= 0) {
      const last = segs[segs.length - 1];
      if (/^\d+$/.test(last)) return { platform: "apple", url: url.toString(), id: last };
    }
    const last = segs[segs.length - 1];
    if (/^id\d+$/.test(last)) return { platform: "apple", url: url.toString(), id: last.slice(2) };
    return { platform: "apple", url: url.toString() };
  }
  if (host === "youtu.be") {
    return { platform: "youtube", url: url.toString(), id: segs[0] };
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) return { platform: "youtube", url: url.toString(), id: v };
    const si = segs.indexOf("shorts");
    if (si >= 0 && segs[si + 1]) return { platform: "youtube", url: url.toString(), id: segs[si + 1] };
    return { platform: "youtube", url: url.toString() };
  }
  if (host === "soundcloud.com" || host === "m.soundcloud.com" || host === "on.soundcloud.com") {
    const info: SourceInfo = { platform: "soundcloud", url: url.toString() };
    if (host !== "on.soundcloud.com" && segs.length >= 2 && segs[1] !== "sets") {
      info.slugArtist = slugToWords(segs[0]);
      info.slugTitle = slugToWords(segs[1]);
    }
    return info;
  }
  if (host.endsWith(".bandcamp.com") || host === "bandcamp.com") {
    const info: SourceInfo = { platform: "bandcamp", url: url.toString() };
    const sub = host.endsWith(".bandcamp.com") ? host.slice(0, -".bandcamp.com".length) : "";
    const ti = segs.indexOf("track");
    if (sub && sub !== "www") info.slugArtist = slugToWords(sub);
    if (ti >= 0 && segs[ti + 1]) info.slugTitle = slugToWords(segs[ti + 1]);
    return info;
  }
  if (host === "beatport.com" || host === "pro.beatport.com") {
    const info: SourceInfo = { platform: "beatport", url: url.toString() };
    const ti = segs.indexOf("track");
    if (ti >= 0 && segs[ti + 1]) {
      info.slugTitle = slugToWords(segs[ti + 1]);
      if (segs[ti + 2] && /^\d+$/.test(segs[ti + 2])) info.id = segs[ti + 2];
    }
    return info;
  }
  if (host === "tidal.com" || host === "listen.tidal.com") {
    const ti = segs.indexOf("track");
    if (ti >= 0 && segs[ti + 1]) return { platform: "tidal", url: url.toString(), id: segs[ti + 1] };
    return { platform: "tidal", url: url.toString() };
  }
  if (host === "deezer.com" || host === "deezer.page.link") {
    const ti = segs.indexOf("track");
    if (ti >= 0 && segs[ti + 1]) return { platform: "deezer", url: url.toString(), id: segs[ti + 1] };
    return { platform: "deezer", url: url.toString() };
  }
  return { platform: "unknown", url: url.toString() };
}

// Bracketed phrases that say nothing about the recording and should be dropped.
const JUNK = [
  "official video",
  "official music video",
  "official audio",
  "official lyric video",
  "official visualizer",
  "lyric video",
  "lyrics",
  "visualizer",
  "music video",
  "official",
  "audio",
  "video",
  "hd",
  "hq",
  "4k",
  "1080p",
  "720p",
  "remaster",
  "remastered",
  "out now",
  "free download",
  "free dl",
  "premiere",
  "clip officiel",
  "explicit",
  "clean",
  "full",
  "high quality",
  "with lyrics",
  "monstercat release",
];

// Bracketed phrases that matter to a DJ and must stay in the title.
const KEEP = [
  "remix",
  "mix",
  "edit",
  "dub",
  "version",
  "bootleg",
  "feat",
  "ft.",
  "ft ",
  "vip",
  "rework",
  "flip",
  "refix",
  "instrumental",
  "acoustic",
  "extended",
  "radio",
  "original",
  "club",
  "live",
  "cover",
  "mashup",
  "demo",
  "acapella",
  "reprise",
  "slowed",
  "sped up",
  "nightcore",
];

function cleanBrackets(s: string): string {
  return s.replace(/\s*[\(\[\{]([^\)\]\}]*)[\)\]\}]/g, (whole, inner: string) => {
    const t = inner.trim().toLowerCase();
    if (!t) return "";
    if (KEEP.some((k) => t.includes(k))) return whole;
    if (JUNK.some((j) => t.includes(j))) return "";
    if (/^\d{4}$/.test(t)) return ""; // a bare year
    return whole;
  });
}

function tidy(s: string): string {
  return s
    .replace(/\s*\|\s*.*$/, (m) => (m.length < s.length ? "" : m)) // drop "| Label" suffixes
    .replace(/^\s*(premiere|premi[eè]re|new|exclusive)\s*[:\-–—]\s*/i, "")
    .replace(/\*+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
    .trim();
}

export function cleanArtistName(a: string): string {
  return a
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*\(?official\)?$/i, "")
    .replace(/\s*official\s*(channel|music)?$/i, "")
    .replace(/\s*music$/i, (m) => (a.trim().split(/\s+/).length > 1 ? "" : m))
    .trim();
}

/** "Artist - Title" / "Artist – Title" / "Artist — Title" / "Artist | Title". */
export function splitArtistTitle(s: string): ArtistTitle {
  const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) {
    const artist = m[1].trim();
    const title = m[2].trim();
    if (artist && title) return { artist, title };
  }
  return { title: s.trim() };
}

/**
 * Turns a YouTube title like
 *   "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)"
 * into { artist: "Rick Astley", title: "Never Gonna Give You Up" }.
 */
export function cleanVideoTitle(rawTitle: string, author?: string): ArtistTitle {
  let s = tidy(cleanBrackets(rawTitle));
  s = tidy(s);
  const split = splitArtistTitle(s);
  if (split.artist) {
    return { artist: tidy(split.artist), title: tidy(split.title) };
  }
  const a = author ? cleanArtistName(author) : "";
  // Titles like "Never Gonna Give You Up by Rick Astley"
  const by = s.match(/^(.+)\s+by\s+(.+)$/i);
  if (by && !a) return { artist: by[2].trim(), title: by[1].trim() };
  return a ? { artist: a, title: s } : { title: s };
}

/** SoundCloud oEmbed titles read "Track by Artist". */
export function parseSoundcloudTitle(t: string): ArtistTitle {
  const i = t.lastIndexOf(" by ");
  if (i > 0) return { artist: t.slice(i + 4).trim(), title: tidy(cleanBrackets(t.slice(0, i))) };
  return cleanVideoTitle(t);
}

/** Spotify's og:description reads "Artist · Album · Song · 1987". */
export function parseSpotifyDescription(d: string): { artist?: string; album?: string; year?: number } {
  const parts = d
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return {};
  const out: { artist?: string; album?: string; year?: number } = { artist: parts[0] };
  const songIdx = parts.findIndex((p) => /^(song|single)$/i.test(p));
  if (songIdx > 1) out.album = parts[1];
  const yr = parts.find((p) => /^\d{4}$/.test(p));
  if (yr) out.year = Number(yr);
  return out;
}

/** Bandcamp og:title reads "Track, by Artist". */
export function parseBandcampTitle(t: string): ArtistTitle {
  const i = t.lastIndexOf(", by ");
  if (i > 0) return { artist: t.slice(i + 5).trim(), title: t.slice(0, i).trim() };
  return cleanVideoTitle(t);
}

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprint(artist: string, title: string, appleId?: string | null): string {
  if (appleId) return `apple:${appleId}`;
  return `name:${normalizeForMatch(artist)}|${normalizeForMatch(title)}`;
}

/** Word-overlap similarity in [0, 1]; good enough to rank catalog matches. */
export function similarity(a: string, b: string): number {
  const wa = new Set(normalizeForMatch(a).split(" ").filter(Boolean));
  const wb = new Set(normalizeForMatch(b).split(" ").filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size);
}

/** Pulls a <meta property|name="..." content="..."> value out of HTML, any attribute order or quoting. */
export function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta\\s+[^>]*?(?:property|name)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const c = m[0].match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
  const v = c ? (c[1] ?? c[2]) : null;
  return v ? decodeEntities(v.trim()) : null;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/**
 * Words in a video title that mean "this is not the record": a cover, an edit, a bootleg, a mix.
 * Such a link stays a YouTube thing; the catalog is not asked to stand in for it.
 */
export const ONE_OFF_WORDS =
  /\b(cover|covers|remix|edit|bootleg|mashup|mash-up|flip|rework|re-work|refix|slowed|sped up|reverb|8d|nightcore|instrumental|karaoke|acoustic|piano|unreleased|leak|dj set|live set|full set|full album|full mix|mix(?:tape)?|session|sessions|version|rendition|tribute|chopped|screwed|lofi|lo-fi)\b/i;

export function looksOneOff(rawTitle: string): boolean {
  return ONE_OFF_WORDS.test(rawTitle);
}
