import { SignJWT, jwtVerify } from "jose";
import { sessionSecret } from "./secret";
import { cookies } from "next/headers";
import { one, run, now, id } from "./db";
import { sha256base64url } from "./crypto";

const COOKIE = "crate_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret(): Uint8Array {
  const s = sessionSecret();
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  id: string;
  name: string;
  isDj: boolean;
  preferredPlatform: string;
  lastfmUser: string | null;
};

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ uid: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${ONE_YEAR}s`).sign(secret());
}

export async function readSessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    // A sign-in link is not a session: it says so, and a cookie never does.
    if (payload.use) return null;
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

const SIGNIN_LINK_TTL = 60 * 60 * 24;
const EMAIL_LINK_TTL = 60 * 60;

/** A one-day link that signs its person in on this address (handed out by the import, or made in Settings for another device). It is not a session cookie and a cookie cannot stand in for it. */
export async function signSignInLink(userId: string): Promise<string> {
  return new SignJWT({ uid: userId, use: "signin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SIGNIN_LINK_TTL}s`).sign(secret());
}

export async function readSignInLink(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.use !== "signin") return null;
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

/** What an email link carries: the address it went to, where to go after, and the account to attach it to when that is the point. */
export type EmailLink = { email: string; next: string; link: string | null };

/** An hour-long link sent to an address: opening it (and pressing the button) proves the address is theirs. */
export async function signEmailLink(l: EmailLink): Promise<string> {
  return new SignJWT({ use: "email", email: l.email, next: l.next, link: l.link ?? undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EMAIL_LINK_TTL}s`)
    .sign(secret());
}

export async function readEmailLink(token: string | undefined): Promise<EmailLink | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.use !== "email" || typeof payload.email !== "string") return null;
    return { email: payload.email, next: typeof payload.next === "string" ? payload.next : "/", link: typeof payload.link === "string" ? payload.link : null };
  } catch {
    return null;
  }
}

/** Google's redirect carries this, signed, so the callback knows what the person set out to do. */
export type GoogleClaim = { next: string; link: string | null };

export async function signGoogleClaim(c: GoogleClaim): Promise<string> {
  return new SignJWT({ use: "google", next: c.next, link: c.link ?? undefined }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m").sign(secret());
}

export async function readGoogleClaim(token: string | null): Promise<GoogleClaim | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.use !== "google") return null;
    return { next: typeof payload.next === "string" ? payload.next : "/", link: typeof payload.link === "string" ? payload.link : null };
  } catch {
    return null;
  }
}

/** Was this one-use token spent already? Spending it is the caller's call (claimOnce). */
export async function spent(token: string): Promise<boolean> {
  return !!(await one("SELECT 1 AS x FROM app_settings WHERE key = ?", [`signin:${sha256base64url(token)}`]));
}

/** Spend a one-use token: true the first time, false after. Old marks are swept as they go. */
export async function claimOnce(token: string): Promise<boolean> {
  if (await spent(token)) return false;
  await run("INSERT INTO app_settings (key, value_enc, updated_at) VALUES (?, '1', ?)", [`signin:${sha256base64url(token)}`, now()]);
  await run("DELETE FROM app_settings WHERE key LIKE 'signin:%' AND updated_at < ?", [now() - 2 * 86400000]);
  return true;
}

/** Only ever a destination inside this Crate: a path, never another site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next.slice(0, 200);
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

export async function userByEmail(email: string): Promise<SessionUser | null> {
  const r = await one<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  return r ? getUser(r.id) : null;
}

export async function userByGoogle(sub: string): Promise<SessionUser | null> {
  const r = await one<{ id: string }>("SELECT id FROM users WHERE google_sub = ?", [sub]);
  return r ? getUser(r.id) : null;
}

export class TakenError extends Error {}

/** Attach an address to an account. Someone else's address stays theirs. */
export async function attachEmail(uid: string, email: string): Promise<void> {
  const other = await one<{ id: string }>("SELECT id FROM users WHERE email = ? AND id != ?", [email, uid]);
  if (other) throw new TakenError("That address already signs in to another Crate account");
  await run("UPDATE users SET email = ? WHERE id = ?", [email, uid]);
}

/** Attach a Google account, and its address when the account has none yet. */
export async function attachGoogle(uid: string, sub: string, email: string | null): Promise<void> {
  const other = await one<{ id: string }>("SELECT id FROM users WHERE google_sub = ? AND id != ?", [sub, uid]);
  if (other) throw new TakenError("That Google account already signs in to another Crate account");
  await run("UPDATE users SET google_sub = ? WHERE id = ?", [sub, uid]);
  if (email) {
    const taken = await one<{ id: string }>("SELECT id FROM users WHERE email = ? AND id != ?", [email, uid]);
    const mine = await one<{ email: string | null }>("SELECT email FROM users WHERE id = ?", [uid]);
    if (!taken && !mine?.email) await run("UPDATE users SET email = ? WHERE id = ?", [email, uid]);
  }
}

export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(COOKIE)?.value);
}

export async function currentUser(): Promise<SessionUser | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  return getUser(uid);
}

export async function getUser(uid: string): Promise<SessionUser | null> {
  const row = await one<{
    id: string;
    name: string;
    is_dj: number;
    preferred_platform: string;
    lastfm_user: string | null;
  }>("SELECT id, name, is_dj, preferred_platform, lastfm_user FROM users WHERE id = ?", [uid]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isDj: !!row.is_dj,
    preferredPlatform: row.preferred_platform,
    lastfmUser: row.lastfm_user,
  };
}

export async function createUser(name: string, extra: { email?: string | null; googleSub?: string | null } = {}): Promise<string> {
  const uid = id("u");
  await run("INSERT INTO users (id, name, preferred_platform, created_at, email, google_sub) VALUES (?, ?, '', ?, ?, ?)", [
    uid,
    name.trim(),
    now(),
    extra.email ?? null,
    extra.googleSub ?? null,
  ]);
  return uid;
}

/** Sets the session cookie on the response for the given user. Call from a route handler. */
export async function setSessionCookie(userId: string): Promise<void> {
  const token = await signSession(userId);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", { path: "/", maxAge: 0 });
}
