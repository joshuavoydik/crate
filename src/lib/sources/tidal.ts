import { getJson, isoDurationMs, type Provider, type SourceItem, type Token } from "./types";
import { postForm, tidalRedirectUri } from "./oauth";
import { getKeys } from "../keys";

/**
 * TIDAL, OAuth 2.1 with PKCE against the TIDAL Developer Platform (developer.tidal.com).
 * Pulls the person's collection of tracks (their favorites). TIDAL does not expose listening
 * history to third parties, so plays on TIDAL reach Crate through Last.fm scrobbling only.
 */
export const TIDAL_SCOPES = "collection.read user.read";

export async function tidalConfigured(): Promise<boolean> {
  return !!(await getKeys()).TIDAL_CLIENT_ID;
}

export async function tidalAuthUrl(state: string, challenge: string): Promise<string> {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: (await getKeys()).TIDAL_CLIENT_ID,
    redirect_uri: tidalRedirectUri(),
    scope: TIDAL_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `https://login.tidal.com/authorize?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; user_id?: number | string };

function withSecret(form: Record<string, string>, secret: string): Record<string, string> {
  return secret ? { ...form, client_secret: secret } : form;
}

export async function tidalExchange(code: string, verifier: string): Promise<Token> {
  const k = await getKeys();
  const t = await postForm<TokenResponse>(
    "https://auth.tidal.com/v1/oauth2/token",
    withSecret(
      { grant_type: "authorization_code", client_id: k.TIDAL_CLIENT_ID, redirect_uri: tidalRedirectUri(), code_verifier: verifier, code },
      k.TIDAL_CLIENT_SECRET,
    ),
  );
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
}

async function ensure(token: Token): Promise<Token> {
  if (Number(token.expires_at ?? 0) - Date.now() > 60_000) return token;
  const k = await getKeys();
  const t = await postForm<TokenResponse>(
    "https://auth.tidal.com/v1/oauth2/token",
    withSecret({ grant_type: "refresh_token", client_id: k.TIDAL_CLIENT_ID, refresh_token: String(token.refresh_token ?? "") }, k.TIDAL_CLIENT_SECRET),
  );
  return { ...token, access_token: t.access_token, refresh_token: t.refresh_token ?? token.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
}

const API = "https://openapi.tidal.com/v2";

function headers(token: Token): Record<string, string> {
  return { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.api+json" };
}

type UserJson = { data?: { id: string; attributes?: { username?: string; country?: string } } };

/** Display name plus the country the catalog should be read for; both go into the stored token. */
export async function tidalMe(token: Token): Promise<{ label: string; country: string }> {
  const me = await getJson<UserJson>(`${API}/users/me`, { headers: headers(token) });
  return { label: me.data?.attributes?.username || "TIDAL", country: me.data?.attributes?.country || "US" };
}

type Resource = {
  id: string;
  type: string;
  attributes?: {
    title?: string;
    name?: string;
    duration?: string;
    externalLinks?: Array<{ href: string; meta?: { type?: string } }>;
  };
  relationships?: { artists?: { data?: Array<{ id: string; type: string }> } };
};

type CollectionJson = {
  data?: Array<{ id: string; type: string; meta?: { addedAt?: string } }>;
  included?: Resource[];
  links?: { next?: string };
};

/** Pure: a page of the collection to source items, newest first as TIDAL returns them. */
export function tidalItemsFromJson(j: CollectionJson, seen: Set<string>, now: number): { items: SourceItem[]; ids: string[] } {
  const byKey = new Map<string, Resource>();
  for (const r of j.included ?? []) byKey.set(`${r.type}:${r.id}`, r);
  const items: SourceItem[] = [];
  const ids: string[] = [];
  (j.data ?? []).forEach((ref, i) => {
    const id = String(ref.id);
    ids.push(id);
    if (seen.has(id)) return;
    const t = byKey.get(`tracks:${id}`);
    if (!t?.attributes?.title) return;
    const artists = (t.relationships?.artists?.data ?? []).map((a) => byKey.get(`artists:${a.id}`)?.attributes?.name).filter((n): n is string => !!n);
    const share = t.attributes.externalLinks?.find((l) => l.meta?.type === "TIDAL_SHARING")?.href;
    const url = share ?? `https://tidal.com/browse/track/${id}`;
    const addedAt = ref.meta?.addedAt ? Date.parse(ref.meta.addedAt) : NaN;
    items.push({
      externalId: id,
      action: "liked",
      at: Number.isFinite(addedAt) ? addedAt : now - i * 60_000,
      meta: {
        artist: artists.join(", "),
        title: t.attributes.title,
        durationMs: isoDurationMs(t.attributes.duration),
        direct: { tidal: url },
        sourcePlatform: "tidal",
        sourceUrl: url,
      },
    });
  });
  return { items, ids };
}

export const tidal: Provider = {
  kind: "tidal",
  async sync({ token, cursor }) {
    if (!token) throw new Error("TIDAL is not connected");
    const tok = await ensure(token);
    const country = typeof tok.country === "string" && tok.country ? tok.country : "US";
    const j = await getJson<CollectionJson>(
      `${API}/userCollectionTracks/me/relationships/items?countryCode=${encodeURIComponent(country)}&include=items,items.artists&page[limit]=50`,
      { headers: headers(tok) },
    );
    const seen = new Set(Array.isArray(cursor.seen) ? (cursor.seen as string[]).map(String) : []);
    const { items, ids } = tidalItemsFromJson(j, seen, Date.now());
    items.sort((a, b) => b.at - a.at);
    return { items, cursor: { seen: ids.slice(0, 100) }, token: tok !== token ? tok : undefined };
  },
};
