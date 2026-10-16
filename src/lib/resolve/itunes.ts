import { similarity, normalizeForMatch } from "./parse";

export type CatalogTrack = {
  appleId: string;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  appleUrl: string | null;
  genre: string | null;
  durationMs: number | null;
  year: number | null;
};

type ItunesResult = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  artistName?: string;
  trackName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
};

const UA = "Crate/0.1 (+https://github.com/crate-app)";

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function bigArt(url?: string): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/i, "/600x600bb.$2");
}

function toTrack(r: ItunesResult): CatalogTrack | null {
  if (r.kind !== "song" || !r.trackId || !r.artistName || !r.trackName) return null;
  return {
    appleId: String(r.trackId),
    artist: r.artistName,
    title: r.trackName,
    album: r.collectionName ?? null,
    artworkUrl: bigArt(r.artworkUrl100),
    previewUrl: r.previewUrl ?? null,
    appleUrl: r.trackViewUrl ?? null,
    genre: r.primaryGenreName ?? null,
    durationMs: r.trackTimeMillis ?? null,
    year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) || null : null,
  };
}

export async function lookupApple(id: string): Promise<CatalogTrack | null> {
  const j = (await getJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`)) as {
    results?: ItunesResult[];
  };
  for (const r of j.results ?? []) {
    const t = toTrack(r);
    if (t && t.appleId === id) return t;
  }
  return null;
}

export async function searchApple(term: string, limit = 8): Promise<CatalogTrack[]> {
  const j = (await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&media=music&limit=${limit}`)) as {
    results?: ItunesResult[];
  };
  return (j.results ?? []).map(toTrack).filter((t): t is CatalogTrack => !!t);
}

/** Versions a search returns that the person almost never meant unless they asked for them. */
const VERSION_WORDS =
  /\b(mixed|mix cut|continuous mix|dj mix|radio edit|extended|instrumental|acapella|acoustic|live|remaster(ed)?|karaoke|sped up|slowed|nightcore|8d|cover|tribute|in the style of|made famous)\b/i;
const COMPILATION_WORDS = /\b(best of|various artists|compilation|mixed by|dj mix|continuous|ministry of sound|now that'?s what|anthems|hits|collection)\b/i;

function stripVersion(t: string): string {
  return t
    .replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scores a catalog result against what the person asked for. Exact titles win; versions the
 * query did not ask for (a "(Mixed)" cut on a compilation, a radio edit, a live take) lose.
 */
export function scoreCandidate(t: CatalogTrack, artist: string | undefined, title: string): number {
  const wantVersion = (title.match(VERSION_WORDS) ?? [])[0]?.toLowerCase();
  const gotVersion = (t.title.match(VERSION_WORDS) ?? [])[0]?.toLowerCase();
  const titleScore = similarity(t.title, title);
  const bareScore = similarity(stripVersion(t.title), stripVersion(title));
  const artistScore = artist ? similarity(t.artist, artist) : 0.5;
  let score = Math.max(titleScore, bareScore * 0.95) * 0.6 + artistScore * 0.4;
  if (normalizeForMatch(t.title) === normalizeForMatch(title)) score += 0.15;
  if (gotVersion && gotVersion !== wantVersion) score -= 0.3;
  if (!wantVersion && COMPILATION_WORDS.test(t.album ?? "")) score -= 0.2;
  if (/karaoke|tribute|in the style of|made famous/i.test(`${t.artist} ${t.album ?? ""}`)) score -= 0.5;
  return score;
}

export async function candidatesApple(artist: string | undefined, title: string, limit = 8): Promise<CatalogTrack[]> {
  const seen = new Set<string>();
  const out: Array<{ t: CatalogTrack; score: number }> = [];
  const terms = [artist ? `${artist} ${title}` : title];
  if (title.includes("(")) terms.push(`${artist ? `${artist} ` : ""}${stripVersion(title)}`);
  for (const term of terms) {
    let results: CatalogTrack[] = [];
    try {
      results = await searchApple(term, 12);
    } catch {
      continue;
    }
    for (const t of results) {
      if (seen.has(t.appleId)) continue;
      seen.add(t.appleId);
      out.push({ t, score: scoreCandidate(t, artist, title) });
    }
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}

/** Finds the best catalog match for an artist/title pair, or null when nothing is close enough. */
export async function matchApple(artist: string | undefined, title: string, opts: { strict?: boolean } = {}): Promise<CatalogTrack | null> {
  const terms = [artist ? `${artist} ${title}` : title];
  if (title.includes("(")) terms.push(`${artist ? `${artist} ` : ""}${stripVersion(title)}`);
  let best: { t: CatalogTrack; score: number } | null = null;
  for (const term of terms) {
    let results: CatalogTrack[] = [];
    try {
      results = await searchApple(term, 10);
    } catch {
      continue;
    }
    for (const t of results) {
      const score = scoreCandidate(t, artist, title);
      if (!best || score > best.score) best = { t, score };
    }
    if (best && best.score >= 0.85) break;
  }
  if (!best) return null;
  // Below this the match is more likely wrong than right; the caller falls back to a bare card.
  // Strict (video links): an exact title on some other artist is not the song, so the bar is higher
  // and the artist has to agree when one was named.
  if (opts.strict) {
    if (best.score < 0.72) return null;
    if (artist && similarity(best.t.artist, artist) < 0.45) return null;
    return best.t;
  }
  return best.score >= 0.45 ? best.t : null;
}
