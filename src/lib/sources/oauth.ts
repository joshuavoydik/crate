import { SignJWT, jwtVerify } from "jose";
import { sessionSecret } from "../secret";
import { randomToken, sha256base64url } from "../crypto";
import { getKeys } from "../keys";

/**
 * OAuth state carried through the redirect as a signed JWT, so the callback can land on a
 * different host than the app (Spotify insists on 127.0.0.1 for local redirects) and still
 * know which user started the connection.
 */
function secret(): Uint8Array {
  return new TextEncoder().encode(sessionSecret());
}

export type OAuthState = { uid: string; kind: string; verifier: string; back: string };

export async function signState(s: OAuthState): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m").sign(secret());
}

export async function readState(token: string | null): Promise<OAuthState | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const p = payload as Partial<OAuthState>;
    if (!p.uid || !p.kind || !p.verifier) return null;
    return { uid: p.uid, kind: p.kind, verifier: p.verifier, back: p.back ?? "/settings" };
  } catch {
    return null;
  }
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  return { verifier, challenge: sha256base64url(verifier) };
}

import { appUrl } from "../app-url";
export { appUrl };

/** Spotify refuses "localhost" in redirect URIs; the loopback IP is the accepted spelling. */
export async function spotifyRedirectUri(): Promise<string> {
  const k = await getKeys();
  if (k.SPOTIFY_REDIRECT_URI) return k.SPOTIFY_REDIRECT_URI;
  return `${appUrl().replace("://localhost", "://127.0.0.1")}/api/connect/spotify/callback`;
}

export function youtubeRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || `${appUrl()}/api/connect/youtube/callback`;
}

export function soundcloudRedirectUri(): string {
  return process.env.SOUNDCLOUD_REDIRECT_URI || `${appUrl()}/api/connect/soundcloud/callback`;
}

export function tidalRedirectUri(): string {
  return process.env.TIDAL_REDIRECT_URI || `${appUrl()}/api/connect/tidal/callback`;
}

export async function postForm<T>(url: string, form: Record<string, string>, headers: Record<string, string> = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams(form).toString(),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${r.status} from ${new URL(url).hostname}: ${text.slice(0, 200)}`);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(t);
  }
}
