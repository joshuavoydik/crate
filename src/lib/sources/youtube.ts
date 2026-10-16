import { getJson, isoDurationMs, type Provider, type SourceItem, type Token } from "./types";
import { postForm, youtubeRedirectUri } from "./oauth";
import { cleanVideoTitle } from "../resolve/parse";
import { getKeys } from "../keys";

/**
 * YouTube via Google OAuth (youtube.readonly). Pulls the Liked videos playlist, which also
 * holds YouTube Music likes, and keeps only videos in the Music category.
 * Watch history is not available from the API to anyone.
 */
export async function youtubeConfigured(): Promise<boolean> {
  const k = await getKeys();
  return !!k.GOOGLE_CLIENT_ID && !!k.GOOGLE_CLIENT_SECRET;
}

export async function youtubeAuthUrl(state: string): Promise<string> {
  const p = new URLSearchParams({
    client_id: (await getKeys()).GOOGLE_CLIENT_ID,
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function youtubeExchange(code: string): Promise<Token> {
  const k = await getKeys();
  const t = await postForm<TokenResponse>("https://oauth2.googleapis.com/token", {
    client_id: k.GOOGLE_CLIENT_ID,
    client_secret: k.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: youtubeRedirectUri(),
  });
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
}

async function ensure(token: Token): Promise<Token> {
  if (Number(token.expires_at ?? 0) - Date.now() > 60_000) return token;
  const k = await getKeys();
  const t = await postForm<TokenResponse>("https://oauth2.googleapis.com/token", {
    client_id: k.GOOGLE_CLIENT_ID,
    client_secret: k.GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: String(token.refresh_token ?? ""),
  });
  return { ...token, access_token: t.access_token, expires_at: Date.now() + t.expires_in * 1000 };
}

export async function youtubeMe(token: Token): Promise<string> {
  const r = await getJson<{ items?: Array<{ snippet?: { title?: string } }> }>("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  return r.items?.[0]?.snippet?.title || "YouTube";
}

type PlaylistItem = {
  snippet: {
    publishedAt: string;
    title: string;
    videoOwnerChannelTitle?: string;
    resourceId: { videoId: string };
    thumbnails?: Record<string, { url: string; width?: number }>;
  };
};
type Video = { id: string; snippet: { categoryId: string; title: string; channelTitle: string }; contentDetails: { duration: string } };

export const youtube: Provider = {
  kind: "youtube",
  async sync({ token, cursor }) {
    if (!token) throw new Error("YouTube is not connected");
    const tok = await ensure(token);
    const auth = { headers: { authorization: `Bearer ${tok.access_token}` } };
    const last = typeof cursor.lastLikedAt === "string" ? cursor.lastLikedAt : null;

    const list = await getJson<{ items?: PlaylistItem[] }>(
      "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LL&maxResults=50",
      auth,
    );
    const fresh = (list.items ?? []).filter((it) => it.snippet?.resourceId?.videoId && (!last || it.snippet.publishedAt > last));
    const candidates = last ? fresh : fresh.slice(0, 25);
    let newest = last;
    const items: SourceItem[] = [];
    if (candidates.length) {
      const ids = candidates.map((c) => c.snippet.resourceId.videoId).join(",");
      const vids = await getJson<{ items?: Video[] }>(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(ids)}`,
        auth,
      );
      const byId = new Map((vids.items ?? []).map((v) => [v.id, v]));
      for (const c of candidates) {
        if (!newest || c.snippet.publishedAt > newest) newest = c.snippet.publishedAt;
        const v = byId.get(c.snippet.resourceId.videoId);
        if (!v || v.snippet.categoryId !== "10") continue; // not music
        const at = cleanVideoTitle(v.snippet.title, v.snippet.channelTitle);
        const thumbs = c.snippet.thumbnails ?? {};
        const art = (thumbs.maxres ?? thumbs.standard ?? thumbs.high ?? thumbs.medium)?.url ?? null;
        const url = `https://www.youtube.com/watch?v=${v.id}`;
        items.push({
          externalId: v.id,
          action: "liked",
          at: Date.parse(c.snippet.publishedAt),
          meta: {
            artist: at.artist ?? v.snippet.channelTitle,
            title: at.title,
            artworkUrl: art,
            durationMs: isoDurationMs(v.contentDetails?.duration),
            direct: { youtube: url },
            sourcePlatform: "youtube",
            sourceUrl: url,
          },
        });
      }
    }
    items.sort((a, b) => b.at - a.at);
    return { items, cursor: { lastLikedAt: newest }, token: tok !== token ? tok : undefined };
  },
};
