import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { one, run, now, id } from "./db";

const COOKIE = "crate_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET || "crate-dev-secret-change-me-in-production";
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
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
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

export async function createUser(name: string): Promise<string> {
  const uid = id("u");
  await run("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)", [uid, name.trim(), now()]);
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
