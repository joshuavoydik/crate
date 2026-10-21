import { all, one, run, now, id as newId } from "./db";
import { decrypt, encrypt } from "./crypto";
import { spotifyNowPlaying, spotifyTrackUri, spotifyPlay, SpotifyPlayError, SpotifyScopeError, spotifyTokenCurrent } from "./sources/spotify";
import { lastfmNowPlaying } from "./sources/lastfm";
import { trackForMeta, ingestItems, type SourceRow } from "./sync";
import type { TrackMeta } from "./resolve";
import { getTrack, membersOf, avatarUrlFor } from "./queries";
import type { Person, Track } from "./types";

/**
 * Live: what each person in a crew is playing right now.
 *
 * Four feeds write into one row per person:
 *   - the Crate player itself (a heartbeat while a preview plays; always wins while fresh),
 *   - the Mac helper (Music, Spotify and a SoundCloud tab on that computer; wins while fresh),
 *   - Spotify's currently-playing endpoint,
 *   - Last.fm's "now playing" flag.
 * Reads refresh the external feeds lazily, so nothing polls while nobody is looking.
 */

export type LivePerson = {
  person: Person;
  /** True while something is actually playing (fresh within the window). */
  live: boolean;
  source: string | null;
  track: Track | null;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  url: string | null;
  progressMs: number | null;
  durationMs: number | null;
  /** When the current song started, when known. */
  startedAt: number | null;
  /** Last time we saw this person playing anything. */
  updatedAt: number | null;
};

type PresenceRow = {
  user_id: string;
  source: string;
  playing: number;
  track_id: string | null;
  title: string | null;
  artist: string | null;
  artwork_url: string | null;
  url: string | null;
  progress_ms: number | null;
  duration_ms: number | null;
  started_at: number | null;
  updated_at: number;
  checked_at: number;
};

/** A Crate heartbeat counts as "live" this long after the last one. */
const APP_FRESH = 25_000;
/** An external feed is re-asked at most this often per person. */
const EXTERNAL_EVERY = 15_000;
/** "Live" expires after this much silence, whatever the feed said last time. */
const LIVE_WINDOW = 90_000;

async function presenceOf(userId: string): Promise<PresenceRow | null> {
  return one<PresenceRow>("SELECT * FROM presence WHERE user_id = ?", [userId]);
}

type Write = {
  source: string;
  playing: boolean;
  trackId: string | null;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  url: string | null;
  progressMs: number | null;
  durationMs: number | null;
  startedAt: number | null;
};

/** A new song, or the same song after a long silence, opens a new history row; otherwise the open row is extended. */
async function remember(userId: string, prev: PresenceRow | null, w: Write, t: number): Promise<void> {
  if (!w.playing || !w.title) return;
  const sameSong = !!prev && prev.title === w.title && prev.artist === w.artist;
  const recent = !!prev && t - prev.updated_at < 10 * 60 * 1000;
  if (sameSong && recent && prev.playing) {
    await run("UPDATE live_history SET ended_at = ? WHERE id = (SELECT id FROM live_history WHERE user_id = ? ORDER BY started_at DESC LIMIT 1)", [t, userId]);
    return;
  }
  await run(
    "INSERT INTO live_history (id, user_id, source, track_id, title, artist, artwork_url, url, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [newId("lh"), userId, w.source, w.trackId, w.title, w.artist, w.artworkUrl, w.url, w.startedAt ?? t, t],
  );
}

async function write(userId: string, w: Write, checked: boolean): Promise<void> {
  const t = now();
  const prev = await presenceOf(userId);
  await remember(userId, prev, w, t);
  await run(
    `INSERT INTO presence (user_id, source, playing, track_id, title, artist, artwork_url, url, progress_ms, duration_ms, started_at, updated_at, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET source = excluded.source, playing = excluded.playing, track_id = excluded.track_id, title = excluded.title,
       artist = excluded.artist, artwork_url = excluded.artwork_url, url = excluded.url, progress_ms = excluded.progress_ms,
       duration_ms = excluded.duration_ms, started_at = excluded.started_at, updated_at = excluded.updated_at, checked_at = excluded.checked_at`,
    [userId, w.source, w.playing ? 1 : 0, w.trackId, w.title, w.artist, w.artworkUrl, w.url, w.progressMs, w.durationMs, w.startedAt, t, checked ? t : 0],
  );
}

/** The in-app player reporting what it is doing. */
export async function heartbeat(
  userId: string,
  input: {
    trackId: string;
    playing: boolean;
    progressMs: number | null;
    durationMs: number | null;
  },
): Promise<void> {
  const track = await getTrack(input.trackId);
  if (!track) return;
  const prev = await presenceOf(userId);
  const sameSong = prev?.source === "crate" && prev.track_id === track.id;
  await write(
    userId,
    {
      source: "crate",
      playing: input.playing,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      url: track.links.apple?.url ?? track.links.spotify?.url ?? null,
      progressMs: input.progressMs,
      durationMs: input.durationMs ?? track.durationMs,
      startedAt: sameSong && prev?.started_at ? prev.started_at : now() - (input.progressMs ?? 0),
    },
    false,
  );
}

/** A play counts once it has run this long; the helper reports every few seconds. */
const PLAY_AFTER = 30_000;

export type MacReport = {
  source: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  positionMs: number | null;
  url: string | null;
};

function platformOf(source: string): TrackMeta["sourcePlatform"] {
  return source === "apple" || source === "spotify" || source === "soundcloud" || source === "youtube" || source === "tidal" || source === "deezer" ? source : "unknown";
}

/**
 * The Mac helper saying what that computer is playing. Live follows it at once; after half a
 * minute of the same song it is logged as a play, which the crew rules turn into a playlist row.
 */
export async function reportFromMac(userId: string, r: MacReport | null): Promise<void> {
  const t = now();
  const prev = await presenceOf(userId);
  if (!r) {
    if (prev && prev.playing && prev.checked_at === 0 && prev.source !== "crate") await run("UPDATE presence SET playing = 0, updated_at = ? WHERE user_id = ?", [t, userId]);
    return;
  }
  const meta: TrackMeta = {
    artist: r.artist,
    title: r.title,
    album: r.album,
    durationMs: r.durationMs,
    direct:
      r.url && r.source === "spotify" && /open\.spotify\.com/.test(r.url)
        ? { spotify: r.url }
        : r.url && r.source === "soundcloud"
          ? { soundcloud: r.url }
          : r.url && r.source === "youtube"
            ? { youtube: r.url }
            : r.url && r.source === "tidal"
              ? { tidal: r.url }
              : r.url && r.source === "deezer"
                ? { deezer: r.url }
                : {},
    sourcePlatform: platformOf(r.source),
    sourceUrl: r.url ?? "",
  };
  const same = !!prev && prev.source === r.source && prev.title === r.title && prev.artist === r.artist && t - prev.updated_at < 10 * 60 * 1000;
  let trackId: string | null = same ? prev!.track_id : null;
  let track: Track | null = null;
  if (!trackId) {
    try {
      track = await withTimeout(trackForMeta(meta), 6000);
      trackId = track.id;
    } catch {
      trackId = null;
    }
  } else track = await getTrack(trackId);
  const startedAt = same && prev?.started_at ? prev.started_at : r.positionMs != null ? t - r.positionMs : t;
  await write(
    userId,
    {
      source: r.source,
      playing: true,
      trackId,
      title: track?.title ?? r.title,
      artist: track?.artist ?? r.artist,
      artworkUrl: track?.artworkUrl ?? null,
      url: r.url ?? track?.links.apple?.url ?? null,
      progressMs: r.positionMs,
      durationMs: r.durationMs ?? track?.durationMs ?? null,
      startedAt,
    },
    false,
  );
  // Half a minute in, it is a play. Idempotent: the same start is logged once.
  if (t - startedAt >= PLAY_AFTER) {
    await ingestItems(userId, r.source, [{ externalId: `mac:${startedAt}`, action: "played", at: startedAt, meta }]);
  }
}

/** Asks Spotify or Last.fm what this person is playing, if their last answer is stale. */
async function refreshExternal(userId: string, prev: PresenceRow | null): Promise<void> {
  const t = now();
  // The player in Crate, or the Mac helper, spoke recently: no need to ask a platform.
  if (prev && prev.checked_at === 0 && prev.playing && t - prev.updated_at < APP_FRESH) return;
  if (prev && t - prev.checked_at < EXTERNAL_EVERY) return;
  const sources = await all<SourceRow>("SELECT * FROM sources WHERE user_id = ? AND kind IN ('spotify', 'lastfm') AND status != 'off'", [userId]);
  const sp = sources.find((s) => s.kind === "spotify" && s.token_enc);
  const lf = sources.find((s) => s.kind === "lastfm" && s.label);
  if (!sp && !lf) return;

  // Claim the check in one statement, so of every reader asking at once (each tab, each device, the
  // rail and the Live page) exactly one asks the platform; the rest take its answer. Doing it
  // in two steps let several through, and each wrote its own copy of the song into the history.
  if (prev) {
    const claimed = await run("UPDATE presence SET checked_at = ? WHERE user_id = ? AND checked_at < ?", [t, userId, t - EXTERNAL_EVERY]);
    if (!claimed) return;
  } else
    await write(
      userId,
      {
        source: "none",
        playing: false,
        trackId: null,
        title: null,
        artist: null,
        artworkUrl: null,
        url: null,
        progressMs: null,
        durationMs: null,
        startedAt: null,
      },
      true,
    );

  if (sp) {
    try {
      const token = JSON.parse(decrypt(sp.token_enc!)) as Record<string, unknown>;
      if (!spotifyTokenCurrent(token)) throw new SpotifyScopeError("Reconnect Spotify to show what you are playing");
      const r = await spotifyNowPlaying(token);
      if (r.token) await run("UPDATE sources SET token_enc = ? WHERE id = ?", [encrypt(JSON.stringify(r.token)), sp.id]);
      // Spotify answered, so the token has what Live needs: a reconnect flag raised here earlier is lifted.
      if (sp.status === "reauth") await run("UPDATE sources SET status = 'ok', error = NULL WHERE id = ?", [sp.id]);
      if (r.now) {
        const started = r.now.progressMs != null ? t - r.now.progressMs : t;
        let trackId: string | null = null;
        try {
          trackId = (await withTimeout(trackForMeta(r.now.meta), 6000)).id;
        } catch {
          trackId = null;
        }
        await write(
          userId,
          {
            source: "spotify",
            playing: r.now.playing,
            trackId,
            title: r.now.meta.title,
            artist: r.now.meta.artist,
            artworkUrl: r.now.meta.artworkUrl,
            url: r.now.meta.sourceUrl,
            progressMs: r.now.progressMs,
            durationMs: r.now.durationMs,
            startedAt: started,
          },
          true,
        );
        return;
      }
      // Nothing on: keep the last song for "last played", but mark it stopped.
      if (prev && prev.playing) await run("UPDATE presence SET playing = 0, checked_at = ? WHERE user_id = ?", [t, userId]);
    } catch (e) {
      // A token from before Live existed lacks the now-playing scope: say so where the person connected it.
      if (e instanceof SpotifyScopeError && sp.status !== "reauth") {
        await run("UPDATE sources SET status = 'reauth', error = ? WHERE id = ?", [e.message, sp.id]);
      }
      /* otherwise offline or Spotify is down: fall through to Last.fm */
    }
  }
  if (lf) {
    try {
      const n = await lastfmNowPlaying(lf.label!);
      if (n) {
        const same = prev?.source === "lastfm" && prev.title === n.title && prev.artist === n.artist;
        let trackId: string | null = prev && same ? prev.track_id : null;
        if (!trackId) {
          try {
            trackId = (
              await withTimeout(
                trackForMeta({
                  artist: n.artist,
                  title: n.title,
                  album: n.album,
                  artworkUrl: n.artworkUrl,
                  direct: {},
                  sourcePlatform: "unknown",
                  sourceUrl: n.url,
                }),
                6000,
              )
            ).id;
          } catch {
            trackId = null;
          }
        }
        await write(
          userId,
          {
            source: "lastfm",
            playing: true,
            trackId,
            title: n.title,
            artist: n.artist,
            artworkUrl: n.artworkUrl,
            url: n.url,
            progressMs: null,
            durationMs: null,
            startedAt: same && prev?.started_at ? prev.started_at : t,
          },
          true,
        );
        return;
      }
      if (prev && prev.playing && prev.source === "lastfm") await run("UPDATE presence SET playing = 0, checked_at = ? WHERE user_id = ?", [t, userId]);
    } catch {
      /* ignore */
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function rowToLive(person: Person, r: PresenceRow | null): Promise<LivePerson> {
  const t = now();
  if (!r || r.source === "none") {
    return {
      person,
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
    };
  }
  // Feeds that report on their own (the player, the Mac helper) go quiet fast when they stop.
  const window = r.checked_at === 0 ? APP_FRESH : LIVE_WINDOW;
  const track = r.track_id ? await getTrack(r.track_id) : null;
  let live = !!r.playing && t - r.updated_at < window;
  // A song that would have ended by now is over, whatever the last poll said.
  if (live && r.duration_ms && r.progress_ms != null && r.progress_ms + (t - r.updated_at) > r.duration_ms + 3000) live = false;
  return {
    person,
    live,
    source: r.source,
    track,
    title: r.title ?? track?.title ?? null,
    artist: r.artist ?? track?.artist ?? null,
    artworkUrl: track?.artworkUrl ?? r.artwork_url,
    url: r.url,
    progressMs: r.progress_ms,
    durationMs: r.duration_ms ?? track?.durationMs ?? null,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
  };
}

export type LiveSession = {
  id: string;
  person: Person;
  source: string;
  track: Track | null;
  title: string | null;
  artist: string | null;
  artworkUrl: string | null;
  url: string | null;
  startedAt: number;
  endedAt: number;
};

/** Past sessions for everyone in the crew, newest first. */
export async function liveHistoryFor(crewId: string, limit = 80): Promise<LiveSession[]> {
  const members = await membersOf(crewId);
  if (!members.length) return [];
  const ids = members.map((m) => m.id);
  const rows = await all<{
    id: string;
    user_id: string;
    source: string;
    track_id: string | null;
    title: string | null;
    artist: string | null;
    artwork_url: string | null;
    url: string | null;
    started_at: number;
    ended_at: number;
  }>(`SELECT * FROM live_history WHERE user_id IN (${ids.map(() => "?").join(",")}) ORDER BY started_at DESC LIMIT ?`, [...ids, limit]);
  const out: LiveSession[] = [];
  const cache = new Map<string, Track | null>();
  for (const r of rows) {
    const person = members.find((m) => m.id === r.user_id)!;
    let track: Track | null = null;
    if (r.track_id) {
      if (!cache.has(r.track_id)) cache.set(r.track_id, await getTrack(r.track_id));
      track = cache.get(r.track_id) ?? null;
    }
    out.push({
      id: r.id,
      person,
      source: r.source,
      track,
      title: r.title,
      artist: r.artist,
      artworkUrl: track?.artworkUrl ?? r.artwork_url,
      url: r.url,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    });
  }
  return out;
}

/** Everyone in the crew, live people first. Refreshes external feeds for anyone stale. */
export async function liveFor(crewId: string): Promise<LivePerson[]> {
  const members = await membersOf(crewId);
  const rows = await Promise.all(members.map((m) => presenceOf(m.id)));
  await Promise.all(members.map((m, i) => refreshExternal(m.id, rows[i]).catch(() => undefined)));
  const fresh = await Promise.all(members.map((m) => presenceOf(m.id)));
  const out = await Promise.all(members.map((m, i) => rowToLive(m, fresh[i])));
  return out.sort((a, b) => Number(b.live) - Number(a.live) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

const TUNED_WINDOW = 45_000;

/** Someone has the Live page or the station open: count them for the next little while. */
export async function tuneIn(crewId: string, viewer: string): Promise<void> {
  await run("INSERT INTO tune_ins (crew_id, viewer, seen_at) VALUES (?, ?, ?) ON CONFLICT(crew_id, viewer) DO UPDATE SET seen_at = excluded.seen_at", [
    crewId,
    viewer,
    now(),
  ]);
}

export async function tunedIn(crewId: string): Promise<number> {
  const r = await one<{ n: number }>("SELECT COUNT(*) AS n FROM tune_ins WHERE crew_id = ? AND seen_at > ?", [crewId, now() - TUNED_WINDOW]);
  return Number(r?.n ?? 0);
}

export type TunedIn = {
  /** Everyone with the Live page or the station open right now: crew members and anonymous listeners together. */
  count: number;
  /** The crew members among them, faces first. */
  people: Person[];
  /** Listeners on the public station with no account. */
  anonymous: number;
};

/** Who is tuned in, not just how many: members get their face, station listeners are a number. */
export async function tunedInDetail(crewId: string): Promise<TunedIn> {
  const rows = await all<{ viewer: string }>("SELECT viewer FROM tune_ins WHERE crew_id = ? AND seen_at > ? ORDER BY seen_at DESC", [crewId, now() - TUNED_WINDOW]);
  const memberIds = rows.map((r) => r.viewer).filter((v) => !v.startsWith("anon:"));
  const anonymous = rows.length - memberIds.length;
  const people: Person[] = [];
  if (memberIds.length) {
    const users = await all<{ id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number }>(
      `SELECT id, name, is_dj, avatar_v, (avatar IS NOT NULL) AS has_avatar FROM users WHERE id IN (${memberIds.map(() => "?").join(", ")})`,
      memberIds,
    );
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const id of memberIds) {
      const u = byId.get(id);
      if (u) people.push({ id: u.id, name: u.name, isDj: !!u.is_dj, avatarUrl: avatarUrlFor(u.id, u.avatar_v ?? 0, !!u.has_avatar) });
    }
  }
  return { count: rows.length, people, anonymous };
}

/**
 * Follow along: play what someone else is playing, right now, on the follower's own Spotify.
 * Spotify to Spotify works at full quality on whatever device they have open; the position is
 * taken from the other person's last report so both are in the same place in the song.
 */
export async function followAlong(followerId: string, targetId: string): Promise<{ title: string; artist: string; device: string | null }> {
  const prev = await presenceOf(targetId);
  await refreshExternal(targetId, prev).catch(() => undefined);
  const row = await presenceOf(targetId);
  const target = await membersOfOne(targetId);
  const live = row ? await rowToLive(target, row) : null;
  if (!live || !live.live || !live.title) throw new Error("They are not playing anything right now.");
  const src = await one<SourceRow>("SELECT * FROM sources WHERE user_id = ? AND kind = 'spotify' AND token_enc IS NOT NULL", [followerId]);
  if (!src) throw new Error("Connect Spotify in Settings to follow along.");
  let token = JSON.parse(decrypt(src.token_enc!)) as Record<string, unknown>;
  const spotifyUrl = live.source === "spotify" ? live.url : live.track?.links.spotify?.direct ? live.track.links.spotify.url : null;
  const found = await spotifyTrackUri(token, live.artist ?? "", live.title, spotifyUrl);
  if (found.token) token = found.token;
  if (!found.uri) throw new Error(`Could not find "${live.title}" on Spotify.`);
  const pos = live.progressMs != null && live.updatedAt ? live.progressMs + (now() - live.updatedAt) : live.startedAt ? now() - live.startedAt : 0;
  try {
    const played = await spotifyPlay(token, found.uri, pos);
    if (played.token) token = played.token;
    await run("UPDATE sources SET token_enc = ? WHERE id = ?", [encrypt(JSON.stringify(token)), src.id]);
    return { title: live.title, artist: live.artist ?? "", device: played.device };
  } catch (e) {
    if (e instanceof SpotifyPlayError) throw e;
    throw new Error("Spotify did not take it. Is the app open somewhere?");
  }
}

async function membersOfOne(userId: string): Promise<Person> {
  const r = await one<{ id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number }>(
    "SELECT id, name, is_dj, avatar_v, (avatar IS NOT NULL) AS has_avatar FROM users WHERE id = ?",
    [userId],
  );
  if (!r) throw new Error("No such person");
  return { id: r.id, name: r.name, isDj: !!r.is_dj, avatarUrl: avatarUrlFor(r.id, r.avatar_v ?? 0, !!r.has_avatar) };
}
