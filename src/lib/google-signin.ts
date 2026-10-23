import { getKeys } from "./keys";
import { appUrl } from "./app-url";
import { postForm } from "./sources/oauth";

/**
 * Sign in with Google: the same OAuth client that connects YouTube, asking only who you are. The
 * callback is its own address, registered next to YouTube's in the Google console.
 */
export async function googleSignInConfigured(): Promise<boolean> {
  const k = await getKeys();
  return !!k.GOOGLE_CLIENT_ID && !!k.GOOGLE_CLIENT_SECRET;
}

export function googleSignInRedirectUri(): string {
  return process.env.GOOGLE_SIGNIN_REDIRECT_URI || `${appUrl()}/api/auth/google/callback`;
}

export async function googleSignInUrl(state: string, hint?: string | null): Promise<string> {
  const p = new URLSearchParams({
    client_id: (await getKeys()).GOOGLE_CLIENT_ID,
    redirect_uri: googleSignInRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  if (hint) p.set("login_hint", hint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export type GoogleIdentity = { sub: string; email: string | null; name: string; picture: string | null };

/** Trade the code for who this is. The address counts only when Google says it is verified. */
export async function googleIdentity(code: string): Promise<GoogleIdentity> {
  const k = await getKeys();
  const t = await postForm<{ access_token: string }>("https://oauth2.googleapis.com/token", {
    client_id: k.GOOGLE_CLIENT_ID,
    client_secret: k.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: googleSignInRedirectUri(),
  });
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${t.access_token}` } });
  if (!r.ok) throw new Error("Google did not say who you are");
  const u = (await r.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; given_name?: string; picture?: string };
  if (!u.sub) throw new Error("Google did not say who you are");
  return {
    sub: u.sub,
    email: u.email_verified && u.email ? u.email.toLowerCase() : null,
    name: (u.name || u.given_name || u.email?.split("@")[0] || "Someone").trim().slice(0, 60),
    picture: u.picture ?? null,
  };
}
