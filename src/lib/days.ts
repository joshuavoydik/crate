import { all, one } from "./db";
import { sendsIn, avatarUrlFor } from "./queries";
import type { Person, Send, DaySummary } from "./types";

/**
 * The crew's stream as days. Every track that enters the playlist belongs to the local day it
 * arrived; what is "today" is decided in the viewer's time zone, never the server's, so an
 * evening in San Francisco does not leak into tomorrow because the server sits in UTC.
 */

const DAY_MS = 24 * 3600 * 1000;

function safeTz(tz: string | null | undefined): string {
  try {
    if (tz) new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz || "UTC";
  } catch {
    return "UTC";
  }
}

/** "2026-10-15" for an instant, in a time zone. */
export function localDate(ms: number, tz: string): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(ms));
}

/** Minutes the zone is ahead of UTC at an instant. */
function offsetMinutes(ms: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: safeTz(tz), hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((asUtc - ms) / 60000);
}

/** The UTC instants where a local calendar day starts and ends. */
export function dayRange(date: string, tz: string): { start: number; end: number } {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 12);
  const start = Date.UTC(y, m - 1, d) - offsetMinutes(guess, tz) * 60000;
  const nextGuess = guess + DAY_MS;
  const end = Date.UTC(y, m - 1, d + 1) - offsetMinutes(nextGuess, tz) * 60000;
  return { start, end };
}

/** "Today", "Yesterday", a weekday within the week, else "Oct 9" (with the year when it is not this year). */
export function dayLabel(date: string, todayDate: string, tz: string): string {
  if (date === todayDate) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = todayDate.split("-").map(Number);
  const daysAgo = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / DAY_MS);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(noon);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: y === ty ? undefined : "numeric" }).format(noon);
}

/** "Thursday, October 15" for a day page. */
export function dayTitle(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

type LightRow = { id: string; created_at: number; from_user_id: string; artwork_url: string | null };
type EchoLight = { send_id: string; user_id: string; at: number };

/**
 * One line per day the crew brought something in, newest first: how many, whose faces, a few
 * covers. One pass over light rows; no track resolution, so it stays cheap as the years go by.
 */
export async function daySummaries(crewId: string, tz: string): Promise<DaySummary[]> {
  const rows = await all<LightRow>(
    "SELECT s.id, s.created_at, s.from_user_id, t.artwork_url FROM sends s JOIN tracks t ON t.id = s.track_id WHERE s.crew_id = ? ORDER BY s.created_at DESC",
    [crewId],
  );
  const echoes = await all<EchoLight>("SELECT e.send_id, e.user_id, e.at FROM echoes e JOIN sends s ON s.id = e.send_id WHERE s.crew_id = ?", [crewId]);
  const echoesBySend = new Map<string, EchoLight[]>();
  for (const e of echoes) {
    const list = echoesBySend.get(e.send_id) ?? [];
    list.push(e);
    echoesBySend.set(e.send_id, list);
  }
  const people = new Map<string, Person>();
  const members = await all<{ id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number }>(
    "SELECT u.id, u.name, u.is_dj, u.avatar_v, (u.avatar IS NOT NULL) AS has_avatar FROM users u WHERE u.id IN (SELECT user_id FROM crew_members WHERE crew_id = ?)",
    [crewId],
  );
  for (const m of members) people.set(m.id, { id: m.id, name: m.name, isDj: !!m.is_dj, avatarUrl: avatarUrlFor(m.id, m.avatar_v ?? 0, !!m.has_avatar) });

  const days = new Map<string, DaySummary & { seen: Set<string> }>();
  for (const r of rows) {
    const date = localDate(r.created_at, tz);
    let d = days.get(date);
    if (!d) {
      d = { date, count: 0, art: [], faces: [], firstAt: r.created_at, lastAt: r.created_at, seen: new Set() };
      days.set(date, d);
    }
    d.count++;
    d.firstAt = Math.min(d.firstAt, r.created_at);
    d.lastAt = Math.max(d.lastAt, r.created_at);
    if (r.artwork_url && d.art.length < 4 && !d.art.includes(r.artwork_url)) d.art.push(r.artwork_url);
    const ids = [r.from_user_id, ...(echoesBySend.get(r.id) ?? []).map((e) => e.user_id)];
    for (const id of ids) {
      if (d.seen.has(id)) continue;
      const p = people.get(id);
      if (p) {
        d.seen.add(id);
        d.faces.push(p);
      }
    }
  }
  return [...days.values()].map(({ seen: _seen, ...d }) => d);
}

/** The sends that entered the playlist on one local day, newest first. */
export async function sendsOnDay(viewerId: string, crewId: string, date: string, tz: string): Promise<Send[]> {
  const { start, end } = dayRange(date, tz);
  const n = await one<{ n: number }>("SELECT COUNT(*) AS n FROM sends WHERE crew_id = ? AND created_at >= ? AND created_at < ?", [crewId, start, end]);
  if (!n || !Number(n.n)) return [];
  // sendsIn orders by last activity and caps at a limit; a day is small, so fetch generously and keep the day's own.
  const all = await sendsIn(viewerId, crewId, 2000);
  return all.filter((s) => s.createdAt >= start && s.createdAt < end).sort((a, b) => b.createdAt - a.createdAt);
}

/** What is on the main page: everything that was brought up (sent or echoed) during the viewer's today. */
export function activeToday(sends: Send[], tz: string, todayDate: string): Send[] {
  return sends.filter((s) => localDate(s.activeAt, tz) === todayDate);
}
