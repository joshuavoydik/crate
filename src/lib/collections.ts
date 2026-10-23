import { all, one, run, now, id, inviteCode } from "./db";
import { getTrack, membersOf, sendsIn } from "./queries";
import { sendsOnDay, activeToday, localDate } from "./days";
import type { Collection, CollectionTrack, Person } from "./types";

/**
 * Playlists a crew makes on purpose (the tables are called playlists; in code they are
 * collections, since "the playlist" is the crew's running stream). Anyone in the crew can start
 * one, add any track Crate knows to it, or take one out. Share turns on a link of its own that
 * anyone can open, no account, and it can be turned off again: a playlist is a thing you can hand
 * to someone, and take back.
 */

type Row = { id: string; crew_id: string; name: string; created_by: string; created_at: number; public_code: string | null; count: number; has?: number; day: string | null };

async function coversOf(collectionId: string): Promise<string[]> {
  const rows = await all<{ artwork_url: string }>(
    "SELECT tr.artwork_url FROM playlist_tracks pt JOIN tracks tr ON tr.id = pt.track_id WHERE pt.playlist_id = ? AND tr.artwork_url IS NOT NULL ORDER BY pt.added_at DESC LIMIT 4",
    [collectionId],
  );
  return rows.map((r) => r.artwork_url);
}

async function hydrate(r: Row): Promise<Collection> {
  return {
    id: r.id,
    crewId: r.crew_id,
    name: r.name,
    createdBy: r.created_by,
    createdAt: Number(r.created_at),
    publicCode: r.public_code ?? "",
    count: Number(r.count),
    covers: await coversOf(r.id),
    has: r.has === undefined ? undefined : Number(r.has) > 0,
    day: r.day ?? null,
  };
}

const COLS = "p.id, p.crew_id, p.name, p.created_by, p.created_at, p.public_code, p.day, (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id = p.id) AS count";

/** The crew's playlists, newest first; with a track id, whether each one already holds it. */
export async function collectionsFor(crewId: string, trackId?: string | null): Promise<Collection[]> {
  const rows = trackId
    ? await all<Row>(`SELECT ${COLS}, (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id = p.id AND t.track_id = ?) AS has FROM playlists p WHERE p.crew_id = ? ORDER BY p.created_at DESC`, [trackId, crewId])
    : await all<Row>(`SELECT ${COLS} FROM playlists p WHERE p.crew_id = ? ORDER BY p.created_at DESC`, [crewId]);
  const out: Collection[] = [];
  for (const r of rows) out.push(await hydrate(r));
  return out;
}

export async function collectionById(collectionId: string): Promise<Collection | null> {
  const r = await one<Row>(`SELECT ${COLS} FROM playlists p WHERE p.id = ?`, [collectionId]);
  return r ? hydrate(r) : null;
}

export async function createCollection(crewId: string, userId: string, name: string): Promise<Collection> {
  const cid = id("pl");
  await run("INSERT INTO playlists (id, crew_id, name, created_by, created_at, public_code) VALUES (?, ?, ?, ?, ?, NULL)", [cid, crewId, name.trim(), userId, now()]);
  return (await collectionById(cid))!;
}

/** The share link on or off. Turning it off withdraws the old link for good; turning it on again mints a new one. */
export async function setCollectionLink(collectionId: string, on: boolean): Promise<string | null> {
  if (!on) {
    await run("UPDATE playlists SET public_code = NULL WHERE id = ?", [collectionId]);
    return null;
  }
  const existing = await one<{ public_code: string | null }>("SELECT public_code FROM playlists WHERE id = ?", [collectionId]);
  if (existing?.public_code) return existing.public_code;
  const code = inviteCode();
  await run("UPDATE playlists SET public_code = ? WHERE id = ?", [code, collectionId]);
  return code;
}

/** The playlist behind a share link, with the crew's name for the page; null for a link that leads nowhere. */
export async function collectionByPublicCode(code: string): Promise<{ collection: Collection; crewName: string } | null> {
  if (!code) return null;
  const r = await one<Row & { crew_name: string }>(`SELECT ${COLS}, c.name AS crew_name FROM playlists p JOIN crews c ON c.id = p.crew_id WHERE p.public_code = ?`, [code.toLowerCase()]);
  if (!r) return null;
  return { collection: await hydrate(r), crewName: r.crew_name };
}

/**
 * Guests: people who opened a playlist's link and signed up to hear it. They can see and play the
 * list and save it to their own service; they are not in the crew and cannot change the list.
 */
export async function addGuest(collectionId: string, userId: string): Promise<void> {
  await run("INSERT OR IGNORE INTO playlist_guests (playlist_id, user_id, joined_at) VALUES (?, ?, ?)", [collectionId, userId, now()]);
}

export async function isGuest(collectionId: string, userId: string): Promise<boolean> {
  return !!(await one("SELECT 1 AS x FROM playlist_guests WHERE playlist_id = ? AND user_id = ?", [collectionId, userId]));
}

/** The playlists this person was let into as a guest, newest first, each with its crew's name. */
export async function guestCollectionsFor(userId: string): Promise<Array<Collection & { crewName: string }>> {
  const rows = await all<Row & { crew_name: string }>(
    `SELECT ${COLS}, c.name AS crew_name FROM playlist_guests g JOIN playlists p ON p.id = g.playlist_id JOIN crews c ON c.id = p.crew_id
     WHERE g.user_id = ? ORDER BY g.joined_at DESC`,
    [userId],
  );
  const out: Array<Collection & { crewName: string }> = [];
  for (const r of rows) out.push({ ...(await hydrate(r)), crewName: r.crew_name });
  return out;
}

export async function renameCollection(collectionId: string, name: string): Promise<void> {
  await run("UPDATE playlists SET name = ? WHERE id = ?", [name.trim(), collectionId]);
}

export async function deleteCollection(collectionId: string): Promise<void> {
  await run("DELETE FROM playlist_tracks WHERE playlist_id = ?", [collectionId]);
  await run("DELETE FROM playlists WHERE id = ?", [collectionId]);
}

/** True when the track went in; false when it was already there. */
export async function addTrack(collectionId: string, trackId: string, userId: string): Promise<boolean> {
  const n = await run("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_by, added_at) VALUES (?, ?, ?, ?)", [collectionId, trackId, userId, now()]);
  return n > 0;
}

export async function removeTrack(collectionId: string, trackId: string): Promise<void> {
  await run("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?", [collectionId, trackId]);
}

/** The tracks in a playlist, in the order they were added, each with who added it. */
export async function tracksIn(collection: Collection): Promise<CollectionTrack[]> {
  const rows = await all<{ track_id: string; added_by: string; added_at: number }>("SELECT track_id, added_by, added_at FROM playlist_tracks WHERE playlist_id = ? ORDER BY added_at", [
    collection.id,
  ]);
  const members = new Map((await membersOf(collection.crewId)).map((m) => [m.id, m]));
  const out: CollectionTrack[] = [];
  for (const r of rows) {
    const track = await getTrack(r.track_id);
    if (!track) continue;
    let by: Person | undefined = members.get(r.added_by);
    if (!by) {
      // Someone who has since left the crew still gets their name on what they added.
      const u = await one<{ name: string }>("SELECT name FROM users WHERE id = ?", [r.added_by]);
      by = { id: r.added_by, name: u?.name ?? "Someone", isDj: false, avatarUrl: null };
    }
    out.push({ track, addedBy: by, addedAt: Number(r.added_at) });
  }
  return out;
}

/**
 * A day of the log, handed on: the first share makes a playlist of that day's songs (each credited
 * to whoever brought it) with its link on; a later share of the same day brings in whatever has
 * arrived since. It lives among the crew's playlists from then on, like any other.
 */
export async function shareDay(crewId: string, userId: string, date: string, tz: string, name: string): Promise<{ collection: Collection; code: string }> {
  // Today is what the log shows today (brought up today, echoes included); an earlier day is what arrived that day.
  const sends = date === localDate(now(), tz) ? activeToday(await sendsIn(userId, crewId, 400), tz, date) : await sendsOnDay(userId, crewId, date, tz);
  let row = await one<{ id: string }>("SELECT id FROM playlists WHERE crew_id = ? AND day = ?", [crewId, date]);
  if (!row) {
    const cid = id("pl");
    await run("INSERT INTO playlists (id, crew_id, name, created_by, created_at, public_code, day) VALUES (?, ?, ?, ?, ?, NULL, ?)", [cid, crewId, name.trim().slice(0, 60) || date, userId, now(), date]);
    row = { id: cid };
  }
  for (const s of [...sends].reverse()) {
    await run("INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, added_by, added_at) VALUES (?, ?, ?, ?)", [row.id, s.track.id, s.from.id, s.createdAt]);
  }
  const code = (await setCollectionLink(row.id, true))!;
  return { collection: (await collectionById(row.id))!, code };
}
