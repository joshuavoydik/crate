import { all, one, run, now } from "./db";
import { avatarUrlFor } from "./queries";
import { liveOf, liveHistoryOf, type LivePerson, type LiveSession } from "./live";
import type { Collection, Person } from "./types";

/**
 * A person's page: the one link that is theirs to post anywhere. The crew stays private; the page
 * shows what its owner decided to show, and nothing else. Following is one-way, needs no invite,
 * and never puts anyone in a crew: it is how you keep up with someone's taste when you are not
 * friends on the same platform.
 */

export type PublicLevel = "off" | "playlists" | "plays";
export const PUBLIC_LEVELS: PublicLevel[] = ["off", "playlists", "plays"];

export type Profile = { person: Person; handle: string; level: PublicLevel };

type UserRow = { id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number; handle: string | null; public: string };
const USER_COLS = "u.id, u.name, u.is_dj, u.avatar_v, (u.avatar IS NOT NULL) AS has_avatar, u.handle, u.public";

function personOf(r: UserRow): Person {
  return { id: r.id, name: r.name, isDj: !!r.is_dj, avatarUrl: avatarUrlFor(r.id, r.avatar_v ?? 0, !!r.has_avatar) };
}

function levelOf(v: string | null | undefined): PublicLevel {
  return v === "playlists" || v === "plays" ? v : "off";
}

/** Handles: lowercase letters, digits and underscores, 3 to 24 long. The address bar is the audience. */
export function normalizeHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9_]{3,24}$/.test(h) ? h : null;
}

const RESERVED = new Set(["crate", "admin", "api", "live", "log", "playlists", "settings", "signin", "join", "radio", "me", "you", "help", "about"]);

export class HandleError extends Error {}

export async function setHandle(uid: string, raw: string): Promise<string> {
  const h = normalizeHandle(raw);
  if (!h) throw new HandleError("A handle is 3 to 24 letters, digits or underscores");
  if (RESERVED.has(h)) throw new HandleError("That one is taken");
  const other = await one<{ id: string }>("SELECT id FROM users WHERE handle = ? AND id != ?", [h, uid]);
  if (other) throw new HandleError("That one is taken");
  await run("UPDATE users SET handle = ? WHERE id = ?", [h, uid]);
  return h;
}

/** A handle for someone who has none yet: their first name, with a number when that is taken. */
export async function ensureHandle(uid: string): Promise<string> {
  const u = await one<{ name: string; handle: string | null }>("SELECT name, handle FROM users WHERE id = ?", [uid]);
  if (!u) throw new HandleError("No such person");
  if (u.handle) return u.handle;
  const base =
    u.name
      .split(" ")[0]
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20) || "someone";
  const stem = base.length < 3 ? `${base}___`.slice(0, 3) : base;
  for (let i = 0; i < 50; i++) {
    const h = i === 0 ? stem : `${stem}${i + 1}`;
    if (RESERVED.has(h)) continue;
    const taken = await one<{ id: string }>("SELECT id FROM users WHERE handle = ?", [h]);
    if (!taken) {
      await run("UPDATE users SET handle = ? WHERE id = ? AND handle IS NULL", [h, uid]);
      return (await one<{ handle: string }>("SELECT handle FROM users WHERE id = ?", [uid]))!.handle;
    }
  }
  throw new HandleError("Could not find a free handle; pick one by hand");
}

export async function setPublicLevel(uid: string, level: PublicLevel): Promise<void> {
  await run("UPDATE users SET public = ? WHERE id = ?", [level, uid]);
  if (level !== "off") await ensureHandle(uid);
}

export async function profileByHandle(handle: string): Promise<Profile | null> {
  const h = normalizeHandle(handle);
  if (!h) return null;
  const r = await one<UserRow>(`SELECT ${USER_COLS} FROM users u WHERE u.handle = ?`, [h]);
  return r ? { person: personOf(r), handle: r.handle!, level: levelOf(r.public) } : null;
}

export async function profileOf(uid: string): Promise<Profile | null> {
  const r = await one<UserRow>(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`, [uid]);
  return r ? { person: personOf(r), handle: r.handle ?? "", level: levelOf(r.public) } : null;
}

/** Playlists this person started that have their link on, across every crew they are in. */
export async function publicPlaylistsOf(uid: string): Promise<Array<Collection & { crewName: string }>> {
  const rows = await all<{
    id: string;
    crew_id: string;
    name: string;
    created_by: string;
    created_at: number;
    public_code: string;
    day: string | null;
    count: number;
    crew_name: string;
  }>(
    `SELECT p.id, p.crew_id, p.name, p.created_by, p.created_at, p.public_code, p.day, c.name AS crew_name,
       (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id = p.id) AS count
     FROM playlists p JOIN crews c ON c.id = p.crew_id
     WHERE p.created_by = ? AND p.public_code IS NOT NULL ORDER BY p.created_at DESC LIMIT 40`,
    [uid],
  );
  const out: Array<Collection & { crewName: string }> = [];
  for (const r of rows) {
    const covers = await all<{ artwork_url: string }>(
      "SELECT tr.artwork_url FROM playlist_tracks pt JOIN tracks tr ON tr.id = pt.track_id WHERE pt.playlist_id = ? AND tr.artwork_url IS NOT NULL ORDER BY pt.added_at DESC LIMIT 4",
      [r.id],
    );
    out.push({
      id: r.id,
      crewId: r.crew_id,
      name: r.name,
      createdBy: r.created_by,
      createdAt: Number(r.created_at),
      publicCode: r.public_code,
      count: Number(r.count),
      covers: covers.map((c) => c.artwork_url),
      day: r.day,
      crewName: r.crew_name,
    });
  }
  return out;
}

export async function liveOne(person: Person): Promise<LivePerson> {
  return (await liveOf([person]))[0];
}

export async function recentPlaysOf(person: Person, limit = 30): Promise<LiveSession[]> {
  return liveHistoryOf([person], limit);
}

// ---- following ----

export async function follow(followerId: string, userId: string): Promise<void> {
  if (followerId === userId) return;
  await run("INSERT OR IGNORE INTO follows (follower_id, user_id, created_at) VALUES (?, ?, ?)", [followerId, userId, now()]);
}

export async function unfollow(followerId: string, userId: string): Promise<void> {
  await run("DELETE FROM follows WHERE follower_id = ? AND user_id = ?", [followerId, userId]);
}

export async function isFollowing(followerId: string, userId: string): Promise<boolean> {
  return !!(await one("SELECT 1 AS x FROM follows WHERE follower_id = ? AND user_id = ?", [followerId, userId]));
}

export async function followerCount(userId: string): Promise<number> {
  const r = await one<{ n: number }>("SELECT COUNT(*) AS n FROM follows WHERE user_id = ?", [userId]);
  return Number(r?.n ?? 0);
}

/** The people someone follows, with their handles and what each shows; those who went dark are left out. */
export async function followingOf(followerId: string): Promise<Profile[]> {
  const rows = await all<UserRow>(`SELECT ${USER_COLS} FROM follows f JOIN users u ON u.id = f.user_id WHERE f.follower_id = ? AND u.public != 'off' ORDER BY f.created_at DESC`, [followerId]);
  return rows.map((r) => ({ person: personOf(r), handle: r.handle ?? "", level: levelOf(r.public) }));
}

/** What the people you follow are up to: who is live, and their recent plays (only from those who show plays). */
export async function followingFeed(followerId: string): Promise<{ people: Array<LivePerson & { handle: string; level: PublicLevel }>; plays: LiveSession[] }> {
  const following = await followingOf(followerId);
  const showing = following.filter((p) => p.level === "plays");
  const [live, plays] = await Promise.all([liveOf(showing.map((p) => p.person)), liveHistoryOf(showing.map((p) => p.person), 60)]);
  const byId = new Map(following.map((p) => [p.person.id, p]));
  const quiet: Array<LivePerson & { handle: string; level: PublicLevel }> = following
    .filter((p) => p.level !== "plays")
    .map((p) => ({
      person: p.person,
      live: false,
      source: null,
      track: null,
      title: null,
      artist: null,
      artworkUrl: null,
      url: null,
      progressMs: null,
      durationMs: null,
      startedAt: null,
      updatedAt: null,
      handle: p.handle,
      level: p.level,
    }));
  const people = [...live.map((l) => ({ ...l, handle: byId.get(l.person.id)!.handle, level: byId.get(l.person.id)!.level })), ...quiet];
  return { people, plays };
}
