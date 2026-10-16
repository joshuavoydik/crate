import { getJson, type Provider, type SourceItem, type Token } from "./types";
import { postForm, soundcloudRedirectUri } from "./oauth";
import { cleanVideoTitle } from "../resolve/parse";
import { getKeys } from "../keys";

/**
 * SoundCloud, OAuth 2.1 with PKCE. Needs an approved API app (SOUNDCLOUD_CLIENT_ID/SECRET).
 * Pulls liked tracks; like times are not exposed, so new likes are detected by id.
 */
export async function soundcloudConfigured(): Promise<boolean> {
  const k = await getKeys();
  return !!k.SOUNDCLOUD_CLIENT_ID && !!k.SOUNDCLOUD_CLIENT_SECRET;
}

export async function soundcloudAuthUrl(state: string, challenge: string): Promise<string> {
  const p = new URLSearchParams({
    client_id: (await getKeys()).SOUNDCLOUD_CLIENT_ID,
    redirect_uri: soundcloudRedirectUri(),
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `https://secure.soundcloud.com/authorize?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function soundcloudExchange(code: string, verifier: string): Promise<Token> {
  const k = await getKeys();
  const t = await postForm<TokenResponse>("https://secure.soundcloud.com/oauth/token", {
    grant_type: "authorization_code",
    client_id: k.SOUNDCLOUD_CLIENT_ID,
    client_secret: k.SOUNDCLOUD_CLIENT_SECRET,
    redirect_uri: soundcloudRedirectUri(),
    code_verifier: verifier,
    code,
  });
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
}

async function ensure(token: Token): Promise<Token> {
  if (Number(token.expires_at ?? 0) - Date.now() > 60_000) return token;
  const k = await getKeys();
  const t = await postForm<TokenResponse>("https://secure.soundcloud.com/oauth/token", {
    grant_type: "refresh_token",
    client_id: k.SOUNDCLOUD_CLIENT_ID,
    client_secret: k.SOUNDCLOUD_CLIENT_SECRET,
    refresh_token: String(token.refresh_token ?? ""),
  });
  return { access_token: t.access_token, refresh_token: t.refresh_token ?? token.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
}

export async function soundcloudMe(token: Token): Promise<string> {
  const me = await getJson<{ username?: string; permalink?: string }>("https://api.soundcloud.com/me", {
    headers: { authorization: `OAuth ${token.access_token}` },
  });
  return me.username || me.permalink || "SoundCloud";
}

type ScTrack = {
  id: number;
  title: string;
  user?: { username?: string };
  artwork_url?: string | null;
  permalink_url: string;
  duration?: number;
  release_year?: number | null;
};

export const soundcloud: Provider = {
  kind: "soundcloud",
  async sync({ token, cursor }) {
    if (!token) throw new Error("SoundCloud is not connected");
    const tok = await ensure(token);
    const r = await getJson<{ collection?: ScTrack[] }>("https://api.soundcloud.com/me/likes/tracks?limit=50&linked_partitioning=true", {
      headers: { authorization: `OAuth ${tok.access_token}` },
    });
    const seen = new Set(Array.isArray(cursor.seen) ? (cursor.seen as number[]) : []);
    const first = seen.size === 0;
    const now = Date.now();
    const items: SourceItem[] = [];
    const ids: number[] = [];
    (r.collection ?? []).forEach((t, i) => {
      ids.push(t.id);
      if (seen.has(t.id)) return;
      const at = cleanVideoTitle(t.title, t.user?.username);
      items.push({
        externalId: String(t.id),
        action: "liked",
        at: now - i * 60_000,
        meta: {
          artist: at.artist ?? t.user?.username ?? "",
          title: at.title,
          artworkUrl: t.artwork_url ? t.artwork_url.replace("-large", "-t500x500") : null,
          durationMs: t.duration ?? null,
          year: t.release_year ?? null,
          direct: { soundcloud: t.permalink_url },
          sourcePlatform: "soundcloud",
          sourceUrl: t.permalink_url,
        },
      });
    });
    return { items: first ? items.slice(0, 20) : items, cursor: { seen: ids.slice(0, 100) }, token: tok !== token ? tok : undefined };
  },
};
