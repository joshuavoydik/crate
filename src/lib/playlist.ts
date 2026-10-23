import { all, one, run, now, inviteCode } from "./db";
import { membersOf, sendsIn, unseenCount } from "./queries";
import { daySummaries, activeToday, localDate } from "./days";
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

/** The name of the moment, on the viewer's clock (tz); a crew in one place sees its own evening. */
export async function ensurePlaylistName(crewId: string, sends: Send[], force = false, tz?: string): Promise<{ name: string; by: Playlist["namedBy"] }> {
  const c = await one<CrewNameRow>(
    "SELECT id, name, playlist_name, playlist_named_at, playlist_named_for, playlist_name_by, public_code FROM crews WHERE id = ?",
    [crewId],
  );
  if (!c) return { name: "Playlist", by: "template" };
  const by = (c.playlist_name_by ?? "template") as Playlist["namedBy"];
  if (!force && by === "human" && c.playlist_name) return { name: c.playlist_name, by };
  if (!force) {
    // The name of the moment is the viewer's: a crew across two cities sees two evenings, and neither
    // rewrites the other's. The stored copy only backs pages with no viewer (the public ones), so it is
    // written once and otherwise left alone.
    const name = templatedPlaylistName({ crewName: c.name, memberNames: [], tracks: [], count: sends.length, tz });
    if (!c.playlist_name) await run("UPDATE crews SET playlist_name = ?, playlist_named_at = ?, playlist_named_for = ?, playlist_name_by = 'template' WHERE id = ?", [name, now(), sends.length, crewId]);
    return { name, by: "template" };
  }
  const members = await membersOf(crewId);
  const suggestion = await suggestPlaylistName({
    crewName: c.name,
    memberNames: members.map((m) => m.name.split(" ")[0]),
    tracks: sends.slice(0, 12).map((s) => ({ artist: s.track.artist, title: s.track.title, genre: s.track.genre, year: s.track.year, bpm: s.track.bpm })),
    count: sends.length,
    tz,
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

export async function playlistFor(viewerId: string, crewId: string, opts: { regenerate?: boolean; tz?: string } = {}): Promise<Playlist> {
  const tz = opts.tz || "UTC";
  const today = localDate(now(), tz);
  // Recent activity, ordered by last touch; today's slice is the page, the rest is reached by day.
  // The pieces do not depend on each other, so they go to the database together.
  const [recent, unseen, c, total, allDays, members] = await Promise.all([
    sendsIn(viewerId, crewId, 400),
    unseenCount(viewerId, crewId),
    one<{ public_code: string | null }>("SELECT public_code FROM crews WHERE id = ?", [crewId]),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM sends WHERE crew_id = ?", [crewId]),
    daySummaries(crewId, tz),
    membersOf(crewId),
  ]);
  const sends = activeToday(recent, tz, today);
  const named = await ensurePlaylistName(crewId, recent, !!opts.regenerate, tz);
  const days = allDays.filter((d) => d.date !== today);
  return {
    crewId,
    name: named.name,
    namedBy: named.by,
    count: Number(total?.n ?? 0),
    unseen,
    members,
    sends,
    today,
    days,
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
  const c = await one<{ id: string; name: string; playlist_name: string | null; playlist_name_by: string | null }>(
    "SELECT id, name, playlist_name, playlist_name_by FROM crews WHERE public_code = ?",
    [code],
  );
  if (!c) return null;
  // A templated name is the moment's; the public page has no viewer, so it reads the moment in UTC.
  const playlistName = c.playlist_name_by === "human" && c.playlist_name ? c.playlist_name : templatedPlaylistName({ crewName: c.name, memberNames: [], tracks: [], count: 0, tz: "UTC" });
  return { id: c.id, name: c.name, playlistName };
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
