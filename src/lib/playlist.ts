import { all, one, run, now, inviteCode } from "./db";
import { membersOf, sendsIn, reelFor } from "./queries";
import { suggestPlaylistName, templatedPlaylistName } from "./agent";
import type { Send, Playlist } from "./types";

/**
 * A crew's running playlist: every send, newest first, under the name of the moment.
 * The name follows the day (Thursday afternoon becomes Thursday evening) unless a member set it.
 */

export type { Playlist };

type CrewNameRow = {
  id: string;
  name: string;
  playlist_name: string | null;
  playlist_named_at: number | null;
  playlist_named_for: number;
  playlist_name_by: string | null;
  public_code: string | null;
};

export async function ensurePlaylistName(crewId: string, sends: Send[], force = false): Promise<{ name: string; by: Playlist["namedBy"] }> {
  const c = await one<CrewNameRow>(
    "SELECT id, name, playlist_name, playlist_named_at, playlist_named_for, playlist_name_by, public_code FROM crews WHERE id = ?",
    [crewId],
  );
  if (!c) return { name: "Playlist", by: "template" };
  const by = (c.playlist_name_by ?? "template") as Playlist["namedBy"];
  // The name of the moment is deterministic, so "stale" simply means "not what the moment says".
  const stale = !c.playlist_name || (by !== "human" && c.playlist_name !== templatedPlaylistName({ crewName: c.name, memberNames: [], tracks: [], count: sends.length }));
  if (!force && !stale) return { name: c.playlist_name!, by };
  if (!force && by === "human" && c.playlist_name) return { name: c.playlist_name, by };
  const members = await membersOf(crewId);
  const suggestion = await suggestPlaylistName({
    crewName: c.name,
    memberNames: members.map((m) => m.name.split(" ")[0]),
    tracks: sends.slice(0, 12).map((s) => ({ artist: s.track.artist, title: s.track.title, genre: s.track.genre, year: s.track.year, bpm: s.track.bpm })),
    count: sends.length,
  });
  await run("UPDATE crews SET playlist_name = ?, playlist_named_at = ?, playlist_named_for = ?, playlist_name_by = ? WHERE id = ?", [
    suggestion.name,
    now(),
    sends.length,
    suggestion.by,
    crewId,
  ]);
  return suggestion;
}

export async function renamePlaylist(crewId: string, name: string): Promise<void> {
  await run("UPDATE crews SET playlist_name = ?, playlist_named_at = ?, playlist_name_by = 'human' WHERE id = ?", [name.trim().slice(0, 60), now(), crewId]);
}

export async function playlistFor(viewerId: string, crewId: string, opts: { regenerate?: boolean } = {}): Promise<Playlist> {
  const sends = await sendsIn(viewerId, crewId, 300);
  const unseen = (await reelFor(viewerId, crewId)).length;
  const named = await ensurePlaylistName(crewId, sends, !!opts.regenerate);
  const c = await one<{ public_code: string | null }>("SELECT public_code FROM crews WHERE id = ?", [crewId]);
  return {
    crewId,
    name: named.name,
    namedBy: named.by,
    count: sends.length,
    unseen,
    members: await membersOf(crewId),
    sends,
    publicCode: c?.public_code ?? null,
  };
}

/** Public radio on or off: a read-only page anyone with the link can open. */
export async function setPublicRadio(crewId: string, on: boolean): Promise<string | null> {
  if (!on) {
    await run("UPDATE crews SET public_code = NULL WHERE id = ?", [crewId]);
    return null;
  }
  const existing = await one<{ public_code: string | null }>("SELECT public_code FROM crews WHERE id = ?", [crewId]);
  if (existing?.public_code) return existing.public_code;
  const code = inviteCode();
  await run("UPDATE crews SET public_code = ? WHERE id = ?", [code, crewId]);
  return code;
}

export async function crewByPublicCode(code: string): Promise<{ id: string; name: string; playlistName: string | null } | null> {
  const c = await one<{ id: string; name: string; playlist_name: string | null }>("SELECT id, name, playlist_name FROM crews WHERE public_code = ?", [code]);
  return c ? { id: c.id, name: c.name, playlistName: c.playlist_name } : null;
}

export async function renameCrew(crewId: string, name: string): Promise<void> {
  await run("UPDATE crews SET name = ? WHERE id = ?", [name.trim().slice(0, 60), crewId]);
}

/** Sends for the public page: no viewer, no reactions. */
export async function publicSends(crewId: string, limit = 100): Promise<Send[]> {
  // Reuse the member query with an impossible viewer id so reactions come back null.
  const rows = await all<{ id: string }>("SELECT id FROM sends WHERE crew_id = ? ORDER BY created_at DESC LIMIT ?", [crewId, limit]);
  if (!rows.length) return [];
  return sendsIn("public", crewId, limit);
}
