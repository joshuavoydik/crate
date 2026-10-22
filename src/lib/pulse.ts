import { all, one, now } from "./db";

/**
 * The pulse: the few numbers that say whether a crew is alive, over the last week and the last four.
 * Hand sends are the ones a person chose to make; a reaction is a Keep, a Played out or a line back.
 */
export type CrewPulse = {
  id: string;
  name: string;
  members: number;
  week: Window;
  month: Window;
};

export type Window = {
  /** People who did anything: sent, reacted, played, or opened the app. */
  active: number;
  visitors: number;
  visits: number;
  handSends: number;
  autoSends: number;
  /** Share of hand sends that got any reaction. */
  answered: number;
  reactions: number;
  replies: number;
  liveSessions: number;
  listeners: number;
  /** Two people's sessions that overlapped: listening at the same time. */
  together: number;
};

async function windowFor(crewId: string, since: number): Promise<Window> {
  const n = (r: { n: number } | null) => Number(r?.n ?? 0);
  const members = (await all<{ user_id: string }>("SELECT user_id FROM crew_members WHERE crew_id = ?", [crewId])).map((r) => r.user_id);
  const marks = members.length ? members.map(() => "?").join(",") : "''";
  const day = new Date(since).toISOString().slice(0, 10);
  const hand = n(await one<{ n: number }>("SELECT COUNT(*) AS n FROM sends WHERE crew_id = ? AND created_at >= ? AND (via IS NULL OR via IN ('app', 'imessage'))", [crewId, since]));
  const auto = n(await one<{ n: number }>("SELECT COUNT(*) AS n FROM sends WHERE crew_id = ? AND created_at >= ? AND via IS NOT NULL AND via NOT IN ('app', 'imessage')", [crewId, since]));
  const answered = n(
    await one<{ n: number }>(
      `SELECT COUNT(DISTINCT s.id) AS n FROM sends s JOIN reactions r ON r.send_id = s.id AND r.user_id != s.from_user_id
       WHERE s.crew_id = ? AND s.created_at >= ? AND (s.via IS NULL OR s.via IN ('app', 'imessage')) AND (r.status IN ('saved', 'played') OR (r.reply IS NOT NULL AND r.reply != ''))`,
      [crewId, since],
    ),
  );
  const reactions = n(
    await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM reactions r JOIN sends s ON s.id = r.send_id WHERE s.crew_id = ? AND r.updated_at >= ? AND r.user_id != s.from_user_id AND (r.status IN ('saved', 'played') OR (r.reply IS NOT NULL AND r.reply != ''))`,
      [crewId, since],
    ),
  );
  const replies = n(
    await one<{ n: number }>(`SELECT COUNT(*) AS n FROM reactions r JOIN sends s ON s.id = r.send_id WHERE s.crew_id = ? AND r.updated_at >= ? AND r.reply IS NOT NULL AND r.reply != ''`, [crewId, since]),
  );
  const sessions = await all<{ user_id: string; started_at: number; ended_at: number }>(
    `SELECT user_id, started_at, ended_at FROM live_history WHERE user_id IN (${marks}) AND started_at >= ? ORDER BY started_at`,
    [...members, since],
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
  const visits = await one<{ v: number; p: number }>(`SELECT COALESCE(SUM(n), 0) AS v, COUNT(DISTINCT user_id) AS p FROM visits WHERE user_id IN (${marks}) AND day >= ?`, [...members, day]);
  const activeRows = await all<{ user_id: string }>(
    `SELECT from_user_id AS user_id FROM sends WHERE crew_id = ? AND created_at >= ?
     UNION SELECT r.user_id FROM reactions r JOIN sends s ON s.id = r.send_id WHERE s.crew_id = ? AND r.updated_at >= ?
     UNION SELECT user_id FROM live_history WHERE user_id IN (${marks}) AND started_at >= ?
     UNION SELECT user_id FROM visits WHERE user_id IN (${marks}) AND day >= ?`,
    [crewId, since, crewId, since, ...members, since, ...members, day],
  );
  return {
    active: new Set(activeRows.map((r) => r.user_id).filter((u) => members.includes(u))).size,
    visitors: Number(visits?.p ?? 0),
    visits: Number(visits?.v ?? 0),
    handSends: hand,
    autoSends: auto,
    answered: hand ? Math.round((answered / hand) * 100) : 0,
    reactions,
    replies,
    liveSessions: sessions.length,
    listeners: new Set(sessions.map((s) => s.user_id)).size,
    together,
  };
}

export async function pulse(): Promise<{ crews: CrewPulse[]; pings: number; people: number }> {
  const t = now();
  const crews = await all<{ id: string; name: string }>("SELECT c.id, c.name FROM crews c WHERE (SELECT COUNT(*) FROM crew_members m WHERE m.crew_id = c.id) > 0 ORDER BY c.created_at");
  const out: CrewPulse[] = [];
  for (const c of crews) {
    const members = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM crew_members WHERE crew_id = ?", [c.id]))?.n ?? 0);
    out.push({ id: c.id, name: c.name, members, week: await windowFor(c.id, t - 7 * 86400000), month: await windowFor(c.id, t - 28 * 86400000) });
  }
  const pings = Number((await one<{ n: number }>("SELECT COUNT(DISTINCT user_id) AS n FROM push_subs"))?.n ?? 0);
  const people = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM users"))?.n ?? 0);
  // Quiet crews last: the ones with a pulse are what matter.
  out.sort((a, b) => b.month.active + b.month.handSends - (a.month.active + a.month.handSends));
  return { crews: out, pings, people };
}
