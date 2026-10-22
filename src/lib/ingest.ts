import { all, one, run, now, id } from "./db";
import { randomToken } from "./crypto";
import { resolveUrl } from "./resolve";
import { upsertTrack, createSend } from "./queries";
import { announceSend } from "./push";
import type { SessionUser } from "./auth";

/**
 * Links that arrive from outside the app (the iMessage helper on a Mac). A link from a crew
 * member's known handle becomes a real send from them; anything else lands in the person's
 * log as "received" and shows up in their Reel.
 */

export function normalizeHandle(h: string): string {
  const s = h.trim();
  if (s.includes("@")) return s.toLowerCase();
  const digits = s.replace(/[^\d+]/g, "");
  if (!digits) return s.toLowerCase();
  // Normalize US numbers to +1XXXXXXXXXX so "(415) 555-0100" and "+14155550100" match.
  const d = digits.replace(/^\+/, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

export async function ensureIngestToken(userId: string): Promise<string> {
  const r = await one<{ ingest_token: string | null }>("SELECT ingest_token FROM users WHERE id = ?", [userId]);
  if (r?.ingest_token) return r.ingest_token;
  const t = `crate_${randomToken(24)}`;
  await run("UPDATE users SET ingest_token = ? WHERE id = ?", [t, userId]);
  return t;
}

export async function rotateIngestToken(userId: string): Promise<string> {
  const t = `crate_${randomToken(24)}`;
  await run("UPDATE users SET ingest_token = ? WHERE id = ?", [t, userId]);
  return t;
}

export async function userByIngestToken(token: string): Promise<SessionUser | null> {
  if (!token.startsWith("crate_")) return null;
  const r = await one<{ id: string; name: string; is_dj: number; preferred_platform: string; lastfm_user: string | null }>(
    "SELECT id, name, is_dj, preferred_platform, lastfm_user FROM users WHERE ingest_token = ?",
    [token],
  );
  if (!r) return null;
  return { id: r.id, name: r.name, isDj: !!r.is_dj, preferredPlatform: r.preferred_platform, lastfmUser: r.lastfm_user };
}

export type IngestOutcome = { kind: "send"; sendId: string; crewId: string; fromName: string } | { kind: "received"; logId: string } | { kind: "duplicate" };

export async function ingestLink(input: {
  userId: string;
  url: string;
  fromHandle: string | null;
  fromName: string | null;
  text: string | null;
  at: number | null;
}): Promise<IngestOutcome> {
  const handle = input.fromHandle ? normalizeHandle(input.fromHandle) : null;
  const externalId = `${handle ?? "unknown"}:${input.url}`;
  const dup = await one("SELECT 1 AS x FROM log_entries WHERE user_id = ? AND source_kind = 'imessage' AND external_id = ?", [input.userId, externalId]);
  if (dup) return { kind: "duplicate" };

  // A known crew member? Then this is their send, in the crew the two of you share.
  if (handle) {
    const members = await all<{ id: string; name: string; imessage_handle: string | null }>(
      `SELECT DISTINCT u.id, u.name, u.imessage_handle FROM users u
       JOIN crew_members m ON m.user_id = u.id
       WHERE u.id != ? AND u.imessage_handle IS NOT NULL AND m.crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = ?)`,
      [input.userId, input.userId],
    );
    const sender = members.find((m) => m.imessage_handle && normalizeHandle(m.imessage_handle) === handle);
    if (sender) {
      const shared = await one<{ crew_id: string }>(
        `SELECT a.crew_id FROM crew_members a JOIN crew_members b ON a.crew_id = b.crew_id WHERE a.user_id = ? AND b.user_id = ? ORDER BY a.joined_at LIMIT 1`,
        [input.userId, sender.id],
      );
      if (shared) {
        const already = await one("SELECT 1 AS x FROM sends WHERE crew_id = ? AND from_user_id = ? AND source_url = ? AND created_at > ?", [
          shared.crew_id,
          sender.id,
          input.url,
          now() - 7 * 24 * 3600 * 1000,
        ]);
        if (already) return { kind: "duplicate" };
        const resolved = await resolveUrl(input.url);
        const track = await upsertTrack(resolved);
        const send = await createSend({
          crewId: shared.crew_id,
          trackId: track.id,
          fromUserId: sender.id,
          note: input.text?.trim() ? input.text.trim().slice(0, 280) : null,
          noteBy: "human",
          sourceUrl: input.url,
          via: "imessage",
        });
        announceSend(send).catch(() => undefined);
        // Remember it in the log too, so a re-send of the same link is a no-op.
        await run(
          "INSERT OR IGNORE INTO log_entries (id, user_id, track_id, source_kind, external_id, action, at, meta_json, status, created_at) VALUES (?, ?, ?, 'imessage', ?, 'received', ?, ?, 'seen', ?)",
          [
            id("l"),
            input.userId,
            track.id,
            externalId,
            input.at ?? now(),
            JSON.stringify({ url: input.url, from: handle, fromName: sender.name, text: input.text, sendId: send.id }),
            now(),
          ],
        );
        return { kind: "send", sendId: send.id, crewId: shared.crew_id, fromName: sender.name };
      }
    }
  }

  const resolved = await resolveUrl(input.url);
  const track = await upsertTrack(resolved);
  const lid = id("l");
  await run(
    "INSERT OR IGNORE INTO log_entries (id, user_id, track_id, source_kind, external_id, action, at, meta_json, created_at) VALUES (?, ?, ?, 'imessage', ?, 'received', ?, ?, ?)",
    [
      lid,
      input.userId,
      track.id,
      externalId,
      input.at ?? now(),
      JSON.stringify({ url: input.url, from: handle, fromName: input.fromName, text: input.text }),
      now(),
    ],
  );
  return { kind: "received", logId: lid };
}
