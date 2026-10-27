import { all, one, run, now, id } from "./db";
import { encrypt, decrypt } from "./crypto";
import { PROVIDERS, type SourceKind, type SourceItem } from "./sources";
import { resolveFromMeta, type TrackMeta } from "./resolve";
import { fingerprint } from "./resolve/parse";
import { upsertTrack, createSendUnlessRecent, getTrack, echo } from "./queries";
import { suggestNote } from "./agent";
import type { Track } from "./types";

export type SourceRow = {
  id: string;
  user_id: string;
  kind: SourceKind;
  label: string | null;
  token_enc: string | null;
  cursor_json: string;
  status: string;
  error: string | null;
  last_sync_at: number | null;
  created_at: number;
};

const SYNC_INTERVAL = 3 * 60 * 1000;
const MAX_ITEMS_PER_RUN = 25;
const AUTO_SHARE_WINDOW = 30 * 24 * 3600 * 1000;
/** Two reports of the same track this close together are one listen. */
const SAME_PLAY_WINDOW = 20 * 60 * 1000;

export async function sourcesFor(userId: string): Promise<SourceRow[]> {
  return all<SourceRow>("SELECT * FROM sources WHERE user_id = ? ORDER BY created_at", [userId]);
}

export async function saveSource(input: { userId: string; kind: SourceKind; label: string | null; token: Record<string, unknown> | null }): Promise<void> {
  const enc = input.token ? encrypt(JSON.stringify(input.token)) : null;
  await run("DELETE FROM notice_dismissals WHERE user_id = ? AND (notice_id = ? OR notice_id LIKE ?)", [input.userId, `reconnect:${input.kind}`, `error:${input.kind}:%`]);
  const existing = await one<{ id: string }>("SELECT id FROM sources WHERE user_id = ? AND kind = ?", [input.userId, input.kind]);
  if (existing) {
    await run("UPDATE sources SET label = ?, token_enc = ?, cursor_json = '{}', status = 'ok', error = NULL, last_sync_at = NULL WHERE id = ?", [
      input.label,
      enc,
      existing.id,
    ]);
  } else {
    await run("INSERT INTO sources (id, user_id, kind, label, token_enc, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      id("src"),
      input.userId,
      input.kind,
      input.label,
      enc,
      now(),
    ]);
  }
}

export async function removeSource(userId: string, kind: SourceKind): Promise<void> {
  await run("DELETE FROM sources WHERE user_id = ? AND kind = ?", [userId, kind]);
}

/** Finds or resolves the Track for a source item; cheap when the song is already known. */
export async function trackForMeta(meta: TrackMeta): Promise<Track> {
  const fp = fingerprint(meta.artist, meta.title, meta.appleId ?? null);
  const known = await one<{ id: string }>("SELECT id FROM tracks WHERE fingerprint = ?", [fp]);
  if (known) {
    const t = await getTrack(known.id);
    if (t) return t;
  }
  if (!meta.appleId) {
    const byName = await one<{ id: string }>("SELECT id FROM tracks WHERE fingerprint = ?", [fingerprint(meta.artist, meta.title, null)]);
    if (byName) {
      const t = await getTrack(byName.id);
      if (t) return t;
    }
  }
  const resolved = await resolveFromMeta(meta);
  return upsertTrack(resolved);
}

export type IngestResult = { added: number; shared: number };

/**
 * Writes source items into the person's log and applies their crew rules.
 * Idempotent: an item seen before (same source, id and action) is skipped.
 */
export async function ingestItems(userId: string, kind: string, items: SourceItem[]): Promise<IngestResult> {
  let added = 0;
  let shared = 0;
  for (const item of items) {
    const dup = await one("SELECT 1 AS x FROM log_entries WHERE user_id = ? AND source_kind = ? AND external_id = ? AND action = ?", [
      userId,
      kind,
      item.externalId,
      item.action,
    ]);
    if (dup) continue;
    let track: Track;
    try {
      track = await trackForMeta(item.meta);
    } catch {
      continue;
    }
    // The Mac helper, the extension and a platform's own history can all report one listen; the
    // first one in counts. The look and the write are one statement, so twenty reports landing at
    // once still make one play.
    const args = [id("l"), userId, track.id, kind, item.externalId, item.action, item.at, JSON.stringify({ url: item.meta.sourceUrl }), now()];
    const inserted =
      item.action === "played"
        ? await run(
            `INSERT OR IGNORE INTO log_entries (id, user_id, track_id, source_kind, external_id, action, at, meta_json, created_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
               SELECT 1 FROM log_entries WHERE user_id = ? AND track_id = ? AND action = 'played' AND ABS(at - ?) < ?)`,
            [...args, userId, track.id, item.at, SAME_PLAY_WINDOW],
          )
        : await run("INSERT OR IGNORE INTO log_entries (id, user_id, track_id, source_kind, external_id, action, at, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", args);
    // Already there, from this report's twin or from another device: theirs counts, not this one.
    if (!inserted) continue;
    added++;
    shared += await autoShare(userId, track, kind, item);
    await new Promise((r) => setTimeout(r, 150));
  }
  return { added, shared };
}

/**
 * A play or a like becomes a send in each crew whose rule allows it: "plays" takes everything this
 * person plays and likes, "likes" just the likes, "off" nothing. Only what happened after the rule
 * was turned on counts, so connecting a platform never pours its history into a playlist. A track
 * already in the playlist this month is not added twice.
 */
const SHARE_GRACE = 20 * 60 * 1000;

async function autoShare(userId: string, track: Track, kind: string, item: SourceItem): Promise<number> {
  if (item.action !== "played" && item.action !== "liked") return 0;
  const crews = await all<{ crew_id: string; auto_share: string; share_since: number | null }>(
    "SELECT crew_id, auto_share, share_since FROM crew_members WHERE user_id = ? AND auto_share != 'off'",
    [userId],
  );
  let n = 0;
  for (const c of crews) {
    if (item.action === "played" && c.auto_share !== "plays") continue;
    // A play is dated from its first second, so the song that was on when the person joined (or
    // switched the rule on) started before the line; one song's length of grace lets it through.
    if (item.at + SHARE_GRACE < Number(c.share_since ?? 0)) continue;
    const via = item.action === "played" ? `played:${kind}` : kind;
    const recent = await one<{ id: string; from_user_id: string }>(
      "SELECT id, from_user_id FROM sends WHERE crew_id = ? AND track_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1",
      [c.crew_id, track.id, now() - AUTO_SHARE_WINDOW],
    );
    if (recent) {
      // Already here from someone else: this person's play or like becomes an echo on that row.
      if (recent.from_user_id !== userId) {
        await echo(recent.id, userId, via);
        n++;
      }
      continue;
    }
    let note: string | null = null;
    if (item.action === "liked") {
      // A like is a small act of sending; it gets the agent's one-liner. Plays arrive quietly.
      const others = await all<{ is_dj: number }>("SELECT u.is_dj FROM crew_members m JOIN users u ON u.id = m.user_id WHERE m.crew_id = ? AND m.user_id != ?", [
        c.crew_id,
        userId,
      ]);
      const sender = await one<{ name: string }>("SELECT name FROM users WHERE id = ?", [userId]);
      note = await suggestNote({
        artist: track.artist,
        title: track.title,
        album: track.album,
        genre: track.genre,
        year: track.year,
        bpm: track.bpm,
        keyName: track.keyName,
        senderName: sender?.name ?? "",
        recipientIsDj: others.some((o) => !!o.is_dj),
        sourcePlatform: kind,
      });
    }
    const created = await createSendUnlessRecent(
      {
        crewId: c.crew_id,
        trackId: track.id,
        fromUserId: userId,
        note,
        noteBy: "agent",
        sourceUrl: item.meta.sourceUrl,
        via,
        // The play's own moment, not the sync's: a batch pulled in later still lands in the order it happened.
        createdAt: item.at,
      },
      AUTO_SHARE_WINDOW,
    );
    if (!created) {
      // Lost the race to a row that landed between the look and the write; if it is someone else's, this is an echo on it.
      const won = await one<{ id: string; from_user_id: string }>(
        "SELECT id, from_user_id FROM sends WHERE crew_id = ? AND track_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1",
        [c.crew_id, track.id, now() - AUTO_SHARE_WINDOW],
      );
      if (won && won.from_user_id !== userId) {
        await echo(won.id, userId, via);
        n++;
      }
      continue;
    }
    n++;
  }
  return n;
}

export type SyncReport = { kind: string; added: number; shared: number; error?: string; skipped?: boolean };

/** Runs every connected source for one person that is due (or all, when forced). */
export async function syncUser(userId: string, opts: { force?: boolean; only?: SourceKind } = {}): Promise<SyncReport[]> {
  const sources = await sourcesFor(userId);
  const reports: SyncReport[] = [];
  for (const s of sources) {
    if (opts.only && s.kind !== opts.only) continue;
    if (!opts.force) {
      if (s.last_sync_at && now() - s.last_sync_at < SYNC_INTERVAL) {
        reports.push({ kind: s.kind, added: 0, shared: 0, skipped: true });
        continue;
      }
      // Claim the run in one statement: two syncs of the same person at once (a phone and a laptop
      // both opening the app, the cron under an open tab) would otherwise both pull the same items.
      const t = now();
      const claimed = await run("UPDATE sources SET last_sync_at = ? WHERE id = ? AND (last_sync_at IS NULL OR last_sync_at < ?)", [t, s.id, t - SYNC_INTERVAL]);
      if (!claimed) {
        reports.push({ kind: s.kind, added: 0, shared: 0, skipped: true });
        continue;
      }
    }
    const provider = PROVIDERS[s.kind];
    if (!provider) continue;
    let cursor: Record<string, unknown> = {};
    try {
      cursor = JSON.parse(s.cursor_json || "{}");
    } catch {
      cursor = {};
    }
    let token: Record<string, unknown> | null = null;
    try {
      token = s.token_enc ? (JSON.parse(decrypt(s.token_enc)) as Record<string, unknown>) : null;
    } catch {
      token = null;
    }
    try {
      const r = await provider.sync({ token, cursor, label: s.label });
      // The first sync after connecting only takes the platform's bookmark: Crate starts from now,
      // it does not import what the platform remembers from before.
      const result: IngestResult = s.last_sync_at ? await ingestItems(userId, s.kind, r.items.slice(0, MAX_ITEMS_PER_RUN)) : { added: 0, shared: 0 };
      await run("UPDATE sources SET cursor_json = ?, status = 'ok', error = NULL, last_sync_at = ?, token_enc = COALESCE(?, token_enc) WHERE id = ?", [
        JSON.stringify(r.cursor),
        now(),
        r.token ? encrypt(JSON.stringify(r.token)) : null,
        s.id,
      ]);
      reports.push({ kind: s.kind, ...result });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      await run("UPDATE sources SET status = 'error', error = ?, last_sync_at = ? WHERE id = ?", [msg, now(), s.id]);
      reports.push({ kind: s.kind, added: 0, shared: 0, error: msg });
    }
  }
  return reports;
}

/** Syncs everyone; for a scheduler. */
export async function syncAll(): Promise<Record<string, SyncReport[]>> {
  const users = await all<{ user_id: string }>("SELECT DISTINCT user_id FROM sources");
  const out: Record<string, SyncReport[]> = {};
  for (const u of users) out[u.user_id] = await syncUser(u.user_id);
  return out;
}
