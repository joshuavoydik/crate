import { all, one, run, now, id, inviteCode } from "./db";
import { fingerprint } from "./resolve/parse";
import type { ResolvedTrack } from "./resolve";
import type { Links } from "./resolve/links";
import type { Track, Send, Crew, Person, ReactionStatus, LogItem, AutoShare } from "./types";

export type TrackRow = {
  id: string;
  fingerprint: string;
  artist: string;
  title: string;
  album: string | null;
  artwork_url: string | null;
  preview_url: string | null;
  apple_id: string | null;
  genre: string | null;
  duration_ms: number | null;
  year: number | null;
  links_json: string;
  accent: string | null;
  bpm: number | null;
  key_name: string | null;
  camelot: string | null;
  energy: number | null;
};

export const TRACK_COLS =
  "t.id, t.fingerprint, t.artist, t.title, t.album, t.artwork_url, t.preview_url, t.apple_id, t.genre, t.duration_ms, t.year, t.links_json, t.accent, t.bpm, t.key_name, t.camelot, t.energy";

export function trackFromRow(r: TrackRow): Track {
  let links: Links = {};
  try {
    links = JSON.parse(r.links_json || "{}");
  } catch {
    links = {};
  }
  return {
    id: r.id,
    artist: r.artist,
    title: r.title,
    album: r.album,
    artworkUrl: r.artwork_url,
    previewUrl: r.preview_url,
    appleId: r.apple_id,
    genre: r.genre,
    durationMs: r.duration_ms,
    year: r.year,
    links,
    accent: r.accent,
    bpm: r.bpm,
    keyName: r.key_name,
    camelot: r.camelot,
    energy: r.energy,
  };
}

export async function getTrack(trackId: string): Promise<Track | null> {
  const r = await one<TrackRow>(`SELECT ${TRACK_COLS} FROM tracks t WHERE t.id = ?`, [trackId]);
  return r ? trackFromRow(r) : null;
}

/** Inserts a resolved track or returns the existing one with the same fingerprint, filling gaps. */
export async function upsertTrack(t: ResolvedTrack): Promise<Track> {
  const fp = fingerprint(t.artist, t.title, t.appleId);
  const existing = await one<TrackRow>(`SELECT ${TRACK_COLS} FROM tracks t WHERE t.fingerprint = ?`, [fp]);
  if (existing) {
    const updates: string[] = [];
    const args: (string | number | null)[] = [];
    if (!existing.preview_url && t.previewUrl) {
      updates.push("preview_url = ?");
      args.push(t.previewUrl);
    }
    if (!existing.artwork_url && t.artworkUrl) {
      updates.push("artwork_url = ?");
      args.push(t.artworkUrl);
    }
    if (!existing.accent && t.accent) {
      updates.push("accent = ?");
      args.push(t.accent);
    }
    // Merge direct links we learned from a new source URL.
    let mergedLinks: Links | null = null;
    try {
      const cur = JSON.parse(existing.links_json || "{}") as Links;
      let changed = false;
      for (const [k, v] of Object.entries(t.links) as Array<[keyof Links, { url: string; direct: boolean }]>) {
        if (v.direct && !cur[k]?.direct) {
          cur[k] = v;
          changed = true;
        }
      }
      if (changed) mergedLinks = cur;
    } catch {
      mergedLinks = null;
    }
    if (mergedLinks) {
      updates.push("links_json = ?");
      args.push(JSON.stringify(mergedLinks));
    }
    if (updates.length) {
      args.push(existing.id);
      await run(`UPDATE tracks SET ${updates.join(", ")} WHERE id = ?`, args);
      const fresh = await one<TrackRow>(`SELECT ${TRACK_COLS} FROM tracks t WHERE t.id = ?`, [existing.id]);
      if (fresh) return trackFromRow(fresh);
    }
    return trackFromRow(existing);
  }
  const tid = id("t");
  await run(
    `INSERT INTO tracks (id, fingerprint, artist, title, album, artwork_url, preview_url, apple_id, genre, duration_ms, year, links_json, accent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tid, fp, t.artist, t.title, t.album, t.artworkUrl, t.previewUrl, t.appleId, t.genre, t.durationMs, t.year, JSON.stringify(t.links), t.accent, now()],
  );
  const row = await one<TrackRow>(`SELECT ${TRACK_COLS} FROM tracks t WHERE t.id = ?`, [tid]);
  if (!row) throw new Error("track insert failed");
  return trackFromRow(row);
}

export async function saveAnalysis(
  trackId: string,
  a: { bpm: number | null; keyName: string | null; camelot: string | null; energy: number | null },
): Promise<void> {
  await run("UPDATE tracks SET bpm = ?, key_name = ?, camelot = ?, energy = ? WHERE id = ?", [a.bpm, a.keyName, a.camelot, a.energy, trackId]);
}

// ---------- crews ----------

type CrewRow = { id: string; name: string; invite_code: string };
type MemberRow = { id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number };

/** The URL a person's photo is served from, versioned so a new upload shows at once. */
export function avatarUrlFor(userId: string, version: number, has: boolean): string | null {
  return has ? `/api/avatar/${userId}?v=${version}` : null;
}

export function crewAvatarUrlFor(crewId: string, version: number, has: boolean): string | null {
  return has ? `/api/crews/${crewId}/avatar?v=${version}` : null;
}

export async function membersOf(crewId: string): Promise<Person[]> {
  const rows = await all<MemberRow>(
    `SELECT u.id, u.name, u.is_dj, u.avatar_v, (u.avatar IS NOT NULL) AS has_avatar FROM crew_members m JOIN users u ON u.id = m.user_id WHERE m.crew_id = ? ORDER BY m.joined_at`,
    [crewId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, isDj: !!r.is_dj, avatarUrl: avatarUrlFor(r.id, r.avatar_v, !!r.has_avatar) }));
}

export async function crewsFor(userId: string): Promise<Crew[]> {
  const rows = await all<CrewRow & { auto_share: string; playlist_name: string | null; public_code: string | null; avatar_v: number; has_avatar: number }>(
    `SELECT c.id, c.name, c.invite_code, c.playlist_name, c.public_code, c.avatar_v, (c.avatar IS NOT NULL) AS has_avatar, m.auto_share FROM crews c JOIN crew_members m ON m.crew_id = c.id WHERE m.user_id = ? ORDER BY m.joined_at`,
    [userId],
  );
  const out: Crew[] = [];
  for (const r of rows) {
    out.push({
      id: r.id,
      name: r.name,
      inviteCode: r.invite_code,
      members: await membersOf(r.id),
      autoShare: autoShareOf(r.auto_share),
      playlistName: r.playlist_name,
      publicCode: r.public_code,
      avatarUrl: crewAvatarUrlFor(r.id, r.avatar_v ?? 0, !!r.has_avatar),
    });
  }
  return out;
}

function autoShareOf(v: string | null | undefined): AutoShare {
  return v === "likes" || v === "off" ? v : "plays";
}

/** The caller's rule for one crew. Turning it on starts from now: nothing older is pulled in. */
export async function setAutoShare(userId: string, crewId: string, mode: AutoShare): Promise<void> {
  await run("UPDATE crew_members SET auto_share = ?, share_since = CASE WHEN ? = 'off' THEN share_since ELSE ? END WHERE user_id = ? AND crew_id = ?", [
    mode,
    mode,
    now(),
    userId,
    crewId,
  ]);
}

export async function isMember(userId: string, crewId: string): Promise<boolean> {
  const r = await one("SELECT 1 AS ok FROM crew_members WHERE crew_id = ? AND user_id = ?", [crewId, userId]);
  return !!r;
}

export async function crewByCode(code: string): Promise<Crew | null> {
  const r = await one<CrewRow & { playlist_name: string | null; public_code: string | null; avatar_v: number; has_avatar: number }>(
    "SELECT id, name, invite_code, playlist_name, public_code, avatar_v, (avatar IS NOT NULL) AS has_avatar FROM crews WHERE invite_code = ?",
    [code.toLowerCase()],
  );
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    inviteCode: r.invite_code,
    members: await membersOf(r.id),
    autoShare: "plays",
    playlistName: r.playlist_name,
    publicCode: r.public_code,
    avatarUrl: crewAvatarUrlFor(r.id, r.avatar_v ?? 0, !!r.has_avatar),
  };
}

export async function createCrew(name: string, userId: string): Promise<Crew> {
  const cid = id("c");
  const code = inviteCode();
  const t = now();
  await run("INSERT INTO crews (id, name, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)", [cid, name.trim(), code, userId, t]);
  await run("INSERT INTO crew_members (crew_id, user_id, joined_at, auto_share, share_since) VALUES (?, ?, ?, 'plays', ?)", [cid, userId, t, t]);
  return {
    id: cid,
    name: name.trim(),
    inviteCode: code,
    members: await membersOf(cid),
    autoShare: "plays",
    playlistName: null,
    publicCode: null,
    avatarUrl: null,
  };
}

export async function joinCrew(crewId: string, userId: string): Promise<void> {
  const t = now();
  await run("INSERT OR IGNORE INTO crew_members (crew_id, user_id, joined_at, auto_share, share_since) VALUES (?, ?, ?, 'plays', ?)", [crewId, userId, t, t]);
}

// ---------- sends ----------

export type SendRow = TrackRow & {
  send_id: string;
  crew_id: string;
  from_user_id: string;
  from_name: string;
  from_is_dj: number;
  from_avatar_v: number;
  from_has_avatar: number;
  note: string | null;
  note_by: "human" | "agent";
  source_url: string | null;
  via: string | null;
  send_created_at: number;
  r_status: ReactionStatus | null;
  r_reply: string | null;
  r_updated_at: number | null;
  comment_count?: number | null;
};

const SEND_SELECT = `SELECT s.id AS send_id, s.crew_id, s.from_user_id, u.name AS from_name, u.is_dj AS from_is_dj, u.avatar_v AS from_avatar_v, (u.avatar IS NOT NULL) AS from_has_avatar, s.note, s.note_by, s.source_url, s.via, s.created_at AS send_created_at,
  r.status AS r_status, r.reply AS r_reply, r.updated_at AS r_updated_at, (SELECT COUNT(*) FROM comments cm WHERE cm.send_id = s.id) AS comment_count, ${TRACK_COLS}
  FROM sends s
  JOIN tracks t ON t.id = s.track_id
  JOIN users u ON u.id = s.from_user_id
  LEFT JOIN reactions r ON r.send_id = s.id AND r.user_id = ?`;

type EchoRow = { user_id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number; at: number; via: string };

async function echoesOf(sendId: string): Promise<Send["echoes"]> {
  const rows = await all<EchoRow>(
    `SELECT e.user_id, u.name, u.is_dj, u.avatar_v, (u.avatar IS NOT NULL) AS has_avatar, e.at, e.via
     FROM echoes e JOIN users u ON u.id = e.user_id WHERE e.send_id = ? ORDER BY e.at ASC`,
    [sendId],
  );
  return rows.map((e) => ({
    person: { id: e.user_id, name: e.name, isDj: !!e.is_dj, avatarUrl: avatarUrlFor(e.user_id, e.avatar_v ?? 0, !!e.has_avatar) },
    at: e.at,
    via: e.via,
  }));
}

type ReplyRow = { user_id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number; status: ReactionStatus; reply: string | null; updated_at: number };

/** What other people did with a send: kept it, played it out, or wrote back. The viewer's own reaction is not in here. */
export async function repliesOf(sendId: string, viewerId: string): Promise<Send["replies"]> {
  const rows = await all<ReplyRow>(
    `SELECT r.user_id, u.name, u.is_dj, u.avatar_v, (u.avatar IS NOT NULL) AS has_avatar, r.status, r.reply, r.updated_at
     FROM reactions r JOIN users u ON u.id = r.user_id
     WHERE r.send_id = ? AND r.user_id != ? AND (r.status IN ('saved', 'played') OR (r.reply IS NOT NULL AND r.reply != ''))
     ORDER BY r.updated_at ASC`,
    [sendId, viewerId],
  );
  return rows.map((r) => ({
    person: { id: r.user_id, name: r.name, isDj: !!r.is_dj, avatarUrl: avatarUrlFor(r.user_id, r.avatar_v ?? 0, !!r.has_avatar) },
    status: r.status,
    reply: r.reply,
    at: r.updated_at,
  }));
}

async function withHistory(rows: SendRow[], crewId: string, viewerId: string): Promise<Send[]> {
  const out: Send[] = [];
  for (const r of rows) {
    const hist = await all<{ id: string; name: string; created_at: number }>(
      `SELECT s.id, u.name, s.created_at FROM sends s JOIN users u ON u.id = s.from_user_id
       WHERE s.crew_id = ? AND s.track_id = ? AND s.id != ? AND s.created_at < ? ORDER BY s.created_at DESC LIMIT 5`,
      [crewId, r.id, r.send_id, r.send_created_at],
    );
    out.push(
      sendFromRow(
        r,
        hist.map((h) => ({ sendId: h.id, fromName: h.name, createdAt: h.created_at })),
        await echoesOf(r.send_id),
        await repliesOf(r.send_id, viewerId),
      ),
    );
  }
  return out;
}

/**
 * Someone played or liked a track that is already in the crew from someone else: that is an echo,
 * not a second row. The row gains their face and floats back up.
 */
export async function echo(sendId: string, userId: string, via: string): Promise<void> {
  await run(
    `INSERT INTO echoes (send_id, user_id, at, via) VALUES (?, ?, ?, ?)
     ON CONFLICT(send_id, user_id) DO UPDATE SET at = excluded.at, via = excluded.via`,
    [sendId, userId, now(), via],
  );
}

export function sendFromRow(r: SendRow, history: Send["history"] = [], echoes: Send["echoes"] = [], replies: Send["replies"] = []): Send {
  return {
    id: r.send_id,
    crewId: r.crew_id,
    track: trackFromRow(r),
    from: { id: r.from_user_id, name: r.from_name, isDj: !!r.from_is_dj, avatarUrl: avatarUrlFor(r.from_user_id, r.from_avatar_v ?? 0, !!r.from_has_avatar) },
    note: r.note,
    noteBy: r.note_by,
    sourceUrl: r.source_url,
    createdAt: r.send_created_at,
    reaction: r.r_status ? { status: r.r_status, reply: r.r_reply, updatedAt: r.r_updated_at ?? 0 } : null,
    history,
    via: r.via ?? "app",
    echoes,
    activeAt: Math.max(r.send_created_at, ...echoes.map((e) => e.at)),
    replies,
    commentCount: Number(r.comment_count ?? 0),
  };
}

export async function createSend(input: {
  crewId: string;
  trackId: string;
  fromUserId: string;
  note: string | null;
  noteBy: "human" | "agent";
  sourceUrl: string | null;
  via?: string;
}): Promise<Send> {
  const s = await createSendUnlessRecent(input, 0);
  if (!s) throw new Error("send insert failed");
  return s;
}

/**
 * A send, unless this track already landed in this crew within the window: the check and the
 * write are one statement, so two syncs racing each other cannot both add it. Null when it was
 * already there.
 */
export async function createSendUnlessRecent(input: Parameters<typeof createSend>[0], windowMs: number): Promise<Send | null> {
  const sid = id("s");
  const t = now();
  const args = [sid, input.crewId, input.trackId, input.fromUserId, input.note, input.noteBy, input.sourceUrl, input.via ?? "app", t];
  const inserted = windowMs
    ? await run(
        `INSERT INTO sends (id, crew_id, track_id, from_user_id, note, note_by, source_url, via, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM sends WHERE crew_id = ? AND track_id = ? AND created_at > ?)`,
        [...args, input.crewId, input.trackId, t - windowMs],
      )
    : await run("INSERT INTO sends (id, crew_id, track_id, from_user_id, note, note_by, source_url, via, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", args);
  if (!inserted) return null;
  const s = await getSend(sid, input.fromUserId);
  if (!s) throw new Error("send insert failed");
  return s;
}

export class CodeTakenError extends Error {}

/** A crew's custom invite slug; refused when another crew already has it. */
export async function setInviteCode(crewId: string, code: string): Promise<void> {
  const taken = await one<{ id: string }>("SELECT id FROM crews WHERE invite_code = ? AND id != ?", [code, crewId]);
  if (taken) throw new CodeTakenError("That link is taken");
  await run("UPDATE crews SET invite_code = ? WHERE id = ?", [code, crewId]);
}

export async function getSend(sendId: string, viewerId: string): Promise<Send | null> {
  const r = await one<SendRow>(`${SEND_SELECT} WHERE s.id = ?`, [viewerId, sendId]);
  if (!r) return null;
  const [s] = await withHistory([r], r.crew_id, viewerId);
  return s;
}

/** Unheard sends from other people in this crew, oldest first. */
/** What is new to this person and meant for them: sends and likes from others. Plays stream by quietly. */
export async function reelFor(userId: string, crewId: string): Promise<Send[]> {
  const rows = await all<SendRow>(
    `${SEND_SELECT} WHERE s.crew_id = ? AND s.from_user_id != ? AND s.via NOT LIKE 'played:%' AND (r.status IS NULL OR r.status = 'seen') ORDER BY s.created_at ASC LIMIT 200`,
    [userId, crewId, userId],
  );
  return withHistory(rows, crewId, userId);
}

/** Every track in the crew, most recently brought up first (a send, or someone echoing it). */
export async function sendsIn(userId: string, crewId: string, limit = 200): Promise<Send[]> {
  const rows = await all<SendRow>(
    `${SEND_SELECT} LEFT JOIN (SELECT send_id, MAX(at) AS last_at FROM echoes GROUP BY send_id) e ON e.send_id = s.id
     WHERE s.crew_id = ? ORDER BY MAX(s.created_at, COALESCE(e.last_at, 0)) DESC LIMIT ?`,
    [userId, crewId, limit],
  );
  return withHistory(rows, crewId, userId);
}

export async function react(sendId: string, userId: string, status: ReactionStatus, reply: string | null | undefined): Promise<void> {
  const existing = await one<{ reply: string | null }>("SELECT reply FROM reactions WHERE send_id = ? AND user_id = ?", [sendId, userId]);
  const keptReply = reply === undefined ? (existing?.reply ?? null) : reply;
  await run(
    `INSERT INTO reactions (send_id, user_id, status, reply, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(send_id, user_id) DO UPDATE SET status = excluded.status, reply = excluded.reply, updated_at = excluded.updated_at`,
    [sendId, userId, status, keptReply, now()],
  );
}

/** Everything the viewer saved or played out, across crews, newest first. */
export async function crateFor(userId: string): Promise<Send[]> {
  const rows = await all<SendRow>(`${SEND_SELECT} WHERE r.user_id = ? AND r.status IN ('saved', 'played') ORDER BY r.updated_at DESC LIMIT 500`, [
    userId,
    userId,
  ]);
  return rows.map((r) => sendFromRow(r));
}
