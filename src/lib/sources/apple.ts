import { SignJWT, importPKCS8 } from "jose";
import { getJson, type Provider, type SourceItem } from "./types";
import { getKeys } from "../keys";

/**
 * Apple Music via MusicKit. The browser authorizes with a developer token we sign here
 * (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY from an Apple Developer account) and hands
 * back a Music User Token. Pulls recently played tracks; Apple gives no play timestamps, so
 * new plays are detected by id and dated at sync time.
 */
export async function appleConfigured(): Promise<boolean> {
  const k = await getKeys();
  return !!k.APPLE_TEAM_ID && !!k.APPLE_KEY_ID && !!k.APPLE_PRIVATE_KEY;
}

let cached: { token: string; exp: number; kid: string } | null = null;

/**
 * Whatever shape the .p8 was pasted in (one line, escaped newlines, no header lines, stray
 * spaces), rebuild a proper PKCS#8 PEM from its base64 body.
 */
export function normalizePem(raw: string): string {
  const body = raw
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END)[^-]*-----/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

export async function appleDeveloperToken(): Promise<string> {
  const k = await getKeys();
  if (cached && cached.kid === k.APPLE_KEY_ID && cached.exp - Date.now() > 3600_000) return cached.token;
  const key = await importPKCS8(normalizePem(k.APPLE_PRIVATE_KEY), "ES256");
  const exp = Date.now() + 150 * 24 * 3600 * 1000;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: k.APPLE_KEY_ID })
    .setIssuer(k.APPLE_TEAM_ID)
    .setIssuedAt()
    .setExpirationTime(Math.floor(exp / 1000))
    .sign(key);
  cached = { token, exp, kid: k.APPLE_KEY_ID };
  return token;
}

type Song = {
  id: string;
  type: string;
  attributes: {
    name: string;
    artistName: string;
    albumName?: string;
    artwork?: { url: string };
    durationInMillis?: number;
    releaseDate?: string;
    isrc?: string;
    url?: string;
    previews?: Array<{ url: string }>;
    playParams?: { id?: string; catalogId?: string };
  };
};

export const apple: Provider = {
  kind: "apple",
  async sync({ token, cursor }) {
    const userToken = token && typeof token.musicUserToken === "string" ? token.musicUserToken : null;
    if (!userToken) throw new Error("Apple Music is not connected");
    const dev = await appleDeveloperToken();
    const r = await getJson<{ data?: Song[] }>("https://api.music.apple.com/v1/me/recent/played/tracks?limit=30", {
      headers: { authorization: `Bearer ${dev}`, "music-user-token": userToken },
    });
    // The cursor is the list as last seen, in order. Apple orders by recency, so a track that
    // sits higher than it did last time was played again; a track that is new to the list was played.
    const before = Array.isArray(cursor.seen) ? (cursor.seen as string[]) : [];
    const seen = new Set(before);
    const first = seen.size === 0;
    const items: SourceItem[] = [];
    const now = Date.now();
    const ids: string[] = [];
    (r.data ?? []).forEach((s, i) => {
      const a = s.attributes;
      const catalogId = a.playParams?.catalogId ?? (s.type === "songs" ? s.id : undefined);
      const key = catalogId ?? s.id;
      ids.push(key);
      const was = before.indexOf(key);
      if (was !== -1 && was <= i) return;
      const art = a.artwork?.url ? a.artwork.url.replace("{w}", "600").replace("{h}", "600") : null;
      items.push({
        externalId: `${key}@${first ? "initial" : now}`,
        action: "played",
        at: now - i * 60_000, // keep the list's order when times are unknown
        meta: {
          artist: a.artistName,
          title: a.name,
          album: a.albumName ?? null,
          artworkUrl: art,
          previewUrl: a.previews?.[0]?.url ?? null,
          durationMs: a.durationInMillis ?? null,
          year: a.releaseDate ? Number(a.releaseDate.slice(0, 4)) || null : null,
          appleId: catalogId ?? null,
          direct: a.url ? { apple: a.url } : {},
          sourcePlatform: "apple",
          sourceUrl: a.url ?? `https://music.apple.com/song/${key}`,
        },
      });
    });
    return { items: first ? items.slice(0, 15) : items, cursor: { seen: ids.slice(0, 60) } };
  },
};

// ---------- a Crate playlist, saved to this person's Apple Music library ----------

/** A playlist in this person's library with these catalog songs, in order. Returns its library id. */
export async function appleCreatePlaylist(musicUserToken: string, name: string, description: string, songIds: string[]): Promise<{ id: string }> {
  const dev = await appleDeveloperToken();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch("https://api.music.apple.com/v1/me/library/playlists", {
      method: "POST",
      headers: { authorization: `Bearer ${dev}`, "music-user-token": musicUserToken, "content-type": "application/json" },
      body: JSON.stringify({
        attributes: { name, description },
        relationships: { tracks: { data: songIds.map((id) => ({ id, type: "songs" })) } },
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await r.text();
    if (r.status === 401 || r.status === 403) throw new Error("Reconnect Apple Music once so Crate may save playlists there");
    if (!r.ok) throw new Error(`${r.status} from api.music.apple.com: ${text.slice(0, 160)}`);
    const j = JSON.parse(text) as { data?: Array<{ id: string }> };
    return { id: j.data?.[0]?.id ?? "" };
  } finally {
    clearTimeout(t);
  }
}
