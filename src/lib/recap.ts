import { all, one, now } from "./db";
import { ping, first } from "./push";

/**
 * The week in a crew: what came in by hand, what got kept, who sent most, what played most. The
 * memory feature in its smallest form, and the reason to come back on a Sunday night.
 */
export type Recap = {
  crewId: string;
  crewName: string;
  from: number;
  to: number;
  handSends: number;
  autoSends: number;
  kept: number;
  replies: number;
  topSender: string | null;
  topTrack: { title: string; artist: string; plays: number } | null;
  together: number;
};

const WEEK = 7 * 86400000;

/** Monday 00:00 UTC on or before t. */
export function weekStart(t: number = now()): number {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export async function weekRecap(crewId: string, to: number = weekStart()): Promise<Recap | null> {
  const from = to - WEEK;
  const crew = await one<{ name: string }>("SELECT name FROM crews WHERE id = ?", [crewId]);
  if (!crew) return null;
  const n = (r: { n: number } | null) => Number(r?.n ?? 0);
  const handSends = n(await one<{ n: number }>("SELECT COUNT(*) AS n FROM sends WHERE crew_id = ? AND created_at >= ? AND created_at < ? AND (via IS NULL OR via IN ('app', 'imessage'))", [crewId, from, to]));
  const autoSends = n(await one<{ n: number }>("SELECT COUNT(*) AS n FROM sends WHERE crew_id = ? AND created_at >= ? AND created_at < ? AND via IS NOT NULL AND via NOT IN ('app', 'imessage')", [crewId, from, to]));
  if (!handSends && !autoSends) return null;
  const kept = n(
    await one<{ n: number }>(`SELECT COUNT(*) AS n FROM reactions r JOIN sends s ON s.id = r.send_id WHERE s.crew_id = ? AND r.updated_at >= ? AND r.updated_at < ? AND r.status IN ('saved', 'played') AND r.user_id != s.from_user_id`, [crewId, from, to]),
  );
  const replies = n(
    await one<{ n: number }>(`SELECT COUNT(*) AS n FROM reactions r JOIN sends s ON s.id = r.send_id WHERE s.crew_id = ? AND r.updated_at >= ? AND r.updated_at < ? AND r.reply IS NOT NULL AND r.reply != ''`, [crewId, from, to]),
  );
  const sender = await one<{ name: string; n: number }>(
    `SELECT u.name, COUNT(*) AS n FROM sends s JOIN users u ON u.id = s.from_user_id WHERE s.crew_id = ? AND s.created_at >= ? AND s.created_at < ? AND (s.via IS NULL OR s.via IN ('app', 'imessage')) GROUP BY s.from_user_id ORDER BY n DESC LIMIT 1`,
    [crewId, from, to],
  );
  const members = (await all<{ user_id: string }>("SELECT user_id FROM crew_members WHERE crew_id = ?", [crewId])).map((r) => r.user_id);
  const marks = members.length ? members.map(() => "?").join(",") : "''";
  const top = await one<{ title: string; artist: string; n: number }>(
    `SELECT title, artist, COUNT(*) AS n FROM live_history WHERE user_id IN (${marks}) AND started_at >= ? AND started_at < ? AND title IS NOT NULL GROUP BY LOWER(title), LOWER(artist) ORDER BY n DESC LIMIT 1`,
    [...members, from, to],
  );
  const sessions = await all<{ user_id: string; started_at: number; ended_at: number }>(
    `SELECT user_id, started_at, ended_at FROM live_history WHERE user_id IN (${marks}) AND started_at >= ? AND started_at < ? ORDER BY started_at`,
    [...members, from, to],
  );
  let together = 0;
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length && sessions[j].started_at < sessions[i].ended_at; j++) {
      if (sessions[j].user_id !== sessions[i].user_id) {
        together++;
        break;
      }
    }
  }
  return {
    crewId,
    crewName: crew.name,
    from,
    to,
    handSends,
    autoSends,
    kept,
    replies,
    topSender: sender && Number(sender.n) > 0 ? first(sender.name) : null,
    topTrack: top && Number(top.n) > 1 ? { title: top.title, artist: top.artist, plays: Number(top.n) } : null,
    together,
  };
}

/** One line, the way a friend would say it. */
export function recapLine(r: Recap): string {
  const parts: string[] = [];
  if (r.handSends) parts.push(`${r.handSends} ${r.handSends === 1 ? "song sent" : "songs sent"}${r.topSender ? `, mostly by ${r.topSender}` : ""}`);
  if (r.kept) parts.push(`${r.kept} kept`);
  if (r.replies) parts.push(`${r.replies} ${r.replies === 1 ? "line" : "lines"} back`);
  if (r.autoSends && !r.handSends) parts.push(`${r.autoSends} plays streamed in`);
  if (r.topTrack) parts.push(`${r.topTrack.title} played ${r.topTrack.plays} times`);
  if (r.together) parts.push(`${r.together} ${r.together === 1 ? "time" : "times"} you were on at once`);
  return parts.join(" · ") || "A quiet week.";
}

/** Sends every crew its week, once, to everyone in it who turned pings on. Meant for Monday's cron. */
export async function sendRecaps(): Promise<number> {
  const crews = await all<{ id: string }>("SELECT id FROM crews");
  let sent = 0;
  for (const c of crews) {
    const r = await weekRecap(c.id);
    if (!r) continue;
    const members = (await all<{ user_id: string }>("SELECT user_id FROM crew_members WHERE crew_id = ?", [c.id])).map((m) => m.user_id);
    sent += await ping(members, { title: `This week in ${r.crewName}`, body: recapLine(r), url: "/", tag: `recap:${c.id}:${r.to}` });
  }
  return sent;
}
