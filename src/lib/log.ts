import { all, one, run, now } from "./db";
import { TRACK_COLS, trackFromRow, avatarUrlFor, type TrackRow } from "./queries";
import { SOURCE_LABELS } from "./sources/types";
import type { Send, LogItem, ReactionStatus, Person } from "./types";

/**
 * The personal log: likes and plays from connected sources, links received over iMessage,
 * plus what the person sent and kept inside Crate. Received links also surface in the Reel
 * as cards with ids prefixed "log:", so one reaction path covers both.
 */

type LogRow = TrackRow & {
  log_id: string;
  source_kind: string;
  external_id: string;
  action: string;
  at: number;
  meta_json: string;
  status: string | null;
  reply: string | null;
  status_at: number | null;
};

const LOG_SELECT = `SELECT l.id AS log_id, l.source_kind, l.external_id, l.action, l.at, l.meta_json, l.status, l.reply, l.status_at, ${TRACK_COLS}
  FROM log_entries l JOIN tracks t ON t.id = l.track_id`;

function meta(r: LogRow): Record<string, string> {
  try {
    return JSON.parse(r.meta_json || "{}");
  } catch {
    return {};
  }
}

export function isLogId(id: string): boolean {
  return id.startsWith("log:");
}

/** A received link shaped like a send, so the Reel and Track card can show it unchanged. */
function receivedAsSend(r: LogRow): Send {
  const m = meta(r);
  const name = m.fromName || m.from || "Someone";
  const from: Person = { id: `ext:${m.from ?? name}`, name, isDj: false, avatarUrl: null };
  return {
    id: `log:${r.log_id}`,
    crewId: "",
    track: trackFromRow(r),
    from,
    note: m.text || null,
    noteBy: "human",
    sourceUrl: m.url ?? null,
    createdAt: r.at,
    reaction: r.status ? { status: r.status as ReactionStatus, reply: r.reply, updatedAt: r.status_at ?? 0 } : null,
    history: [],
    via: r.source_kind,
    echoes: [],
    activeAt: r.at,
  };
}

export async function receivedUnheard(userId: string): Promise<Send[]> {
  const rows = await all<LogRow>(
    `${LOG_SELECT} WHERE l.user_id = ? AND l.action = 'received' AND (l.status IS NULL OR l.status = 'seen') ORDER BY l.at ASC LIMIT 100`,
    [userId],
  );
  return rows.map(receivedAsSend);
}

export async function receivedById(userId: string, logId: string): Promise<Send | null> {
  const r = await one<LogRow>(`${LOG_SELECT} WHERE l.user_id = ? AND l.id = ?`, [userId, logId.replace(/^log:/, "")]);
  return r ? receivedAsSend(r) : null;
}

export async function reactToLog(userId: string, logId: string, status: ReactionStatus, reply: string | null | undefined): Promise<void> {
  const id = logId.replace(/^log:/, "");
  if (reply === undefined) {
    await run("UPDATE log_entries SET status = ?, status_at = ? WHERE id = ? AND user_id = ?", [status, now(), id, userId]);
  } else {
    await run("UPDATE log_entries SET status = ?, reply = ?, status_at = ? WHERE id = ? AND user_id = ?", [status, reply, now(), id, userId]);
  }
}

/** Received links the person kept, shaped like sends, newest first. */
export async function keptReceived(userId: string): Promise<Send[]> {
  const rows = await all<LogRow>(
    `${LOG_SELECT} WHERE l.user_id = ? AND l.action = 'received' AND l.status IN ('saved','played') ORDER BY l.status_at DESC LIMIT 300`,
    [userId],
  );
  return rows.map(receivedAsSend);
}

function sourceLabel(kind: string): string {
  return (SOURCE_LABELS as Record<string, string>)[kind] ?? (kind === "imessage" ? "iMessage" : kind);
}

/** Everything the person did or received, newest first. */
export async function logFor(userId: string, limit = 300): Promise<LogItem[]> {
  const items: LogItem[] = [];

  const entries = await all<LogRow>(`${LOG_SELECT} WHERE l.user_id = ? ORDER BY l.at DESC LIMIT ?`, [userId, limit]);
  for (const r of entries) {
    const m = meta(r);
    items.push({
      id: `log:${r.log_id}`,
      action: r.action as LogItem["action"],
      at: r.at,
      track: trackFromRow(r),
      source: r.source_kind,
      detail: r.action === "received" ? m.fromName || m.from || null : sourceLabel(r.source_kind),
      sendId: r.action === "received" ? `log:${r.log_id}` : null,
    });
  }

  const sent = await all<TrackRow & { send_id: string; created_at: number; crew_name: string; via: string }>(
    `SELECT s.id AS send_id, s.created_at, s.via, c.name AS crew_name, ${TRACK_COLS}
     FROM sends s JOIN tracks t ON t.id = s.track_id JOIN crews c ON c.id = s.crew_id
     WHERE s.from_user_id = ? ORDER BY s.created_at DESC LIMIT ?`,
    [userId, limit],
  );
  for (const r of sent) {
    items.push({
      id: `sent:${r.send_id}`,
      action: "sent",
      at: r.created_at,
      track: trackFromRow(r),
      source: r.via === "app" ? "app" : r.via,
      detail: r.crew_name,
      sendId: r.send_id,
    });
  }

  const kept = await all<TrackRow & { send_id: string; status: string; updated_at: number; from_name: string }>(
    `SELECT s.id AS send_id, r.status, r.updated_at, u.name AS from_name, ${TRACK_COLS}
     FROM reactions r JOIN sends s ON s.id = r.send_id JOIN tracks t ON t.id = s.track_id JOIN users u ON u.id = s.from_user_id
     WHERE r.user_id = ? AND r.status IN ('saved','played') ORDER BY r.updated_at DESC LIMIT ?`,
    [userId, limit],
  );
  for (const r of kept) {
    items.push({
      id: `kept:${r.send_id}`,
      action: r.status === "played" ? "playedOut" : "kept",
      at: r.updated_at,
      track: trackFromRow(r),
      source: "app",
      detail: `from ${r.from_name}`,
      sendId: r.send_id,
    });
  }

  const keptLogs = await all<LogRow>(
    `${LOG_SELECT} WHERE l.user_id = ? AND l.action = 'received' AND l.status IN ('saved','played') ORDER BY l.status_at DESC LIMIT ?`,
    [userId, limit],
  );
  for (const r of keptLogs) {
    const m = meta(r);
    items.push({
      id: `keptlog:${r.log_id}`,
      action: r.status === "played" ? "playedOut" : "kept",
      at: r.status_at ?? r.at,
      track: trackFromRow(r),
      source: "app",
      detail: `from ${m.fromName || m.from || "iMessage"}`,
      sendId: `log:${r.log_id}`,
    });
  }

  items.sort((a, b) => b.at - a.at);
  return items.slice(0, limit);
}

/** How many likes came in from sources this week, by source. */
export async function likesThisWeek(userId: string): Promise<Array<{ source: string; n: number }>> {
  const rows = await all<{ source_kind: string; n: number }>(
    "SELECT source_kind, COUNT(*) AS n FROM log_entries WHERE user_id = ? AND action = 'liked' AND at >= ? GROUP BY source_kind ORDER BY n DESC",
    [userId, now() - 7 * 24 * 3600 * 1000],
  );
  return rows.map((r) => ({ source: r.source_kind, n: Number(r.n) }));
}
