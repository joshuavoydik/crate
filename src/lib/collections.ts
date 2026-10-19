import { all, one, run, now, id } from "./db";
import { getTrack, membersOf } from "./queries";
import type { Collection, CollectionTrack, Person } from "./types";

/**
 * Playlists a crew makes on purpose (the tables are called playlists; in code they are
 * collections, since "the playlist" is the crew's running stream). Anyone in the crew can start
 * one, add any track Crate knows to it, or take one out.
 */

type Row = { id: string; crew_id: string; name: string; created_by: string; created_at: number; count: number; has?: number };

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
    count: Number(r.count),
    covers: await coversOf(r.id),
    has: r.has === undefined ? undefined : Number(r.has) > 0,
  };
}

const COLS = "p.id, p.crew_id, p.name, p.created_by, p.created_at, (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id = p.id) AS count";

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
  await run("INSERT INTO playlists (id, crew_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)", [cid, crewId, name.trim(), userId, now()]);
  return (await collectionById(cid))!;
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
