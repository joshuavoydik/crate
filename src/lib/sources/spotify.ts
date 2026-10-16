import { getJson, type Provider, type SourceItem, type Token } from "./types";
import { postForm, spotifyRedirectUri } from "./oauth";
import { getKeys } from "../keys";
import { similarity } from "../resolve/parse";

/**
 * Spotify, Authorization Code with PKCE (no client secret). A new app runs in Development
 * Mode, which allows up to five users; enough for a crew. Pulls liked songs and recent plays.
 */
export const SPOTIFY_SCOPES = "user-library-read user-read-recently-played user-read-currently-playing user-read-playback-state user-modify-playback-state";

export async function spotifyConfigured(): Promise<boolean> {
  return !!(await getKeys()).SPOTIFY_CLIENT_ID;
}

export async function spotifyAuthUrl(state: string, challenge: string): Promise<string> {
  const p = new URLSearchParams({
    client_id: (await getKeys()).SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: await spotifyRedirectUri(),
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  return `https://accounts.spotify.com/authorize?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

export async function spotifyExchange(code: string, verifier: string): Promise<Token> {
  const t = await postForm<TokenResponse>("https://accounts.spotify.com/api/token", {
    client_id: (await getKeys()).SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: await spotifyRedirectUri(),
    code_verifier: verifier,
  });
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000, scope: t.scope ?? SPOTIFY_SCOPES };
}

/** Thrown when a stored token predates a scope this feature needs; the person reconnects once. */
export class SpotifyScopeError extends Error {}

/** True when the token was granted everything the current build asks for. */
export function spotifyTokenCurrent(token: Token): boolean {
  const have = new Set(String(token.scope ?? "").split(/\s+/).filter(Boolean));
  if (!have.size) return false;
  return SPOTIFY_SCOPES.split(" ").every((s) => have.has(s));
}

async function refresh(token: Token): Promise<Token> {
  const t = await postForm<TokenResponse>("https://accounts.spotify.com/api/token", {
    client_id: (await getKeys()).SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: String(token.refresh_token ?? ""),
  });
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + t.expires_in * 1000,
  };
}

async function ensure(token: Token): Promise<Token> {
  const exp = Number(token.expires_at ?? 0);
  if (exp - Date.now() > 60_000) return token;
  return refresh(token);
}

export async function spotifyMe(token: Token): Promise<string> {
  const me = await getJson<{ display_name?: string; id: string }>("https://api.spotify.com/v1/me", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  return me.display_name || me.id;
}

type SpTrack = {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: { name: string; images: Array<{ url: string; width?: number }>; release_date?: string };
  duration_ms: number;
  preview_url: string | null;
  external_urls: { spotify: string };
};

function metaOf(t: SpTrack) {
  const art = [...(t.album.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;
  return {
    artist: t.artists.map((a) => a.name).join(", "),
    title: t.name,
    album: t.album.name,
    artworkUrl: art,
    previewUrl: t.preview_url,
    durationMs: t.duration_ms,
    year: t.album.release_date ? Number(t.album.release_date.slice(0, 4)) || null : null,
    direct: { spotify: t.external_urls.spotify },
    sourcePlatform: "spotify" as const,
    sourceUrl: t.external_urls.spotify,
  };
}

export type NowPlaying = {
  playing: boolean;
  progressMs: number | null;
  durationMs: number | null;
  meta: ReturnType<typeof metaOf>;
};

type CurrentlyPlayingJson = {
  is_playing?: boolean;
  progress_ms?: number | null;
  currently_playing_type?: string;
  item?: SpTrack | null;
};

/** Pure: Spotify's currently-playing payload to a NowPlaying, or null when nothing is on. */
export function nowPlayingFromJson(j: CurrentlyPlayingJson | null | undefined): NowPlaying | null {
  if (!j || !j.item || (j.currently_playing_type && j.currently_playing_type !== "track")) return null;
  return {
    playing: !!j.is_playing,
    progressMs: typeof j.progress_ms === "number" ? j.progress_ms : null,
    durationMs: j.item.duration_ms ?? null,
    meta: metaOf(j.item),
  };
}

/**
 * What this person is playing right now (needs the user-read-currently-playing scope).
 * Returns the refreshed token too, when it rotated.
 */
export async function spotifyNowPlaying(token: Token): Promise<{ now: NowPlaying | null; token?: Token }> {
  const tok = await ensure(token);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=track", {
      headers: { authorization: `Bearer ${tok.access_token}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (r.status === 204) return { now: null, token: tok !== token ? tok : undefined };
    if (r.status === 403) throw new SpotifyScopeError("Reconnect Spotify to show what you are playing");
    if (!r.ok) throw new Error(`${r.status} from api.spotify.com`);
    const j = (await r.json()) as CurrentlyPlayingJson;
    return { now: nowPlayingFromJson(j), token: tok !== token ? tok : undefined };
  } finally {
    clearTimeout(t);
  }
}

export const spotify: Provider = {
  kind: "spotify",
  async sync({ token, cursor }) {
    if (!token) throw new Error("Spotify is not connected");
    const tok = await ensure(token);
    const auth = { headers: { authorization: `Bearer ${tok.access_token}` } };
    const items: SourceItem[] = [];

    // Liked songs, newest first.
    const likes = await getJson<{ items: Array<{ added_at: string; track: SpTrack | null }> }>("https://api.spotify.com/v1/me/tracks?limit=50", auth);
    const lastLike = typeof cursor.lastLikeAt === "string" ? cursor.lastLikeAt : null;
    let newestLike = lastLike;
    for (const it of likes.items) {
      if (!it.track?.id) continue;
      if (lastLike && it.added_at <= lastLike) continue;
      if (!newestLike || it.added_at > newestLike) newestLike = it.added_at;
      items.push({ externalId: it.track.id, action: "liked", at: Date.parse(it.added_at), meta: metaOf(it.track) });
    }

    // Recent plays, newest first.
    const after = typeof cursor.lastPlayedAt === "number" ? cursor.lastPlayedAt : 0;
    const plays = await getJson<{ items: Array<{ played_at: string; track: SpTrack }> }>(
      `https://api.spotify.com/v1/me/player/recently-played?limit=50${after ? `&after=${after}` : ""}`,
      auth,
    );
    let newestPlay = after;
    for (const it of plays.items) {
      const at = Date.parse(it.played_at);
      if (at <= after) continue;
      if (at > newestPlay) newestPlay = at;
      items.push({ externalId: `${it.track.id}@${at}`, action: "played", at, meta: metaOf(it.track) });
    }

    items.sort((a, b) => b.at - a.at);
    // A first sync keeps the most recent 20 likes and 20 plays rather than the whole history.
    const trimmed =
      lastLike === null ? [...items.filter((i) => i.action === "liked").slice(0, 20), ...items.filter((i) => i.action === "played").slice(0, 20)] : items;
    return {
      items: trimmed.sort((a, b) => b.at - a.at),
      cursor: { lastLikeAt: newestLike, lastPlayedAt: newestPlay },
      token: tok !== token ? tok : undefined,
    };
  },
};

// ---------- follow along: play something on this person's own Spotify ----------

export class SpotifyPlayError extends Error {
  code: "no_device" | "premium" | "not_found" | "other";
  constructor(message: string, code: "no_device" | "premium" | "not_found" | "other") {
    super(message);
    this.code = code;
  }
}

/** The Spotify URI for a track, from a Spotify link when we have one, else by searching. */
export async function spotifyTrackUri(token: Token, artist: string, title: string, spotifyUrl?: string | null): Promise<{ uri: string | null; token?: Token }> {
  const m = spotifyUrl?.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/);
  if (m) return { uri: `spotify:track:${m[1]}` };
  const tok = await ensure(token);
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  const r = await getJson<{ tracks?: { items?: SpTrack[] } }>(`https://api.spotify.com/v1/search?type=track&limit=6&q=${q}`, {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  let best: { t: SpTrack; score: number } | null = null;
  for (const t of r.tracks?.items ?? []) {
    const score = similarity(t.name, title) * 0.6 + similarity(t.artists.map((a) => a.name).join(" "), artist) * 0.4;
    if (!best || score > best.score) best = { t, score };
  }
  return { uri: best && best.score >= 0.5 ? `spotify:track:${best.t.id}` : null, token: tok !== token ? tok : undefined };
}

/** Starts a track on whatever device this person's Spotify is open on, at a position. */
export async function spotifyPlay(token: Token, uri: string, positionMs: number): Promise<{ token?: Token; device: string | null }> {
  const tok = await ensure(token);
  const auth = { authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" };
  const body = JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) });
  const attempt = async (deviceId?: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      return await fetch(`https://api.spotify.com/v1/me/player/play${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""}`, {
        method: "PUT",
        headers: auth,
        body,
        signal: ctrl.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(t);
    }
  };
  let r = await attempt();
  let device: string | null = null;
  if (r.status === 404) {
    // No active device: pick the first one Spotify knows about (a phone with the app open, a desktop).
    const d = await getJson<{ devices?: Array<{ id: string; name: string; is_restricted?: boolean }> }>("https://api.spotify.com/v1/me/player/devices", {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    const pick = (d.devices ?? []).find((x) => !x.is_restricted);
    if (!pick) throw new SpotifyPlayError("Open Spotify on your phone or computer first, then try again.", "no_device");
    device = pick.name;
    r = await attempt(pick.id);
  }
  if (r.status === 403) {
    const text = await r.text().catch(() => "");
    if (/scope|permission/i.test(text)) throw new SpotifyPlayError("Reconnect Spotify once (Settings → Where you listen) so Crate may control playback.", "other");
    throw new SpotifyPlayError("Spotify only lets Premium accounts be controlled this way.", "premium");
  }
  if (!r.ok && r.status !== 204) throw new SpotifyPlayError(`Spotify said ${r.status}.`, "other");
  return { token: tok !== token ? tok : undefined, device };
}
