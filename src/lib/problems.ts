import { all, one, run, now } from "./db";

/**
 * What is quietly broken: a source that stopped syncing or wants a reconnect, a device whose pings
 * keep failing, and when the crons last ran. For the maker, so a friend never has to report it.
 */
export type Problems = {
  sources: Array<{ who: string; kind: string; status: string; error: string | null; lastSyncAt: number | null }>;
  pushes: Array<{ who: string; ua: string | null; fails: number; lastOkAt: number | null }>;
  crons: Array<{ name: string; at: number | null }>;
  people: Array<{ name: string; crews: number; sources: number; lastSeen: number | null }>;
};

export async function problems(): Promise<Problems> {
  const sources = await all<{ who: string; kind: string; status: string; error: string | null; last_sync_at: number | null }>(
    `SELECT u.name AS who, s.kind, s.status, s.error, s.last_sync_at FROM sources s JOIN users u ON u.id = s.user_id
     WHERE s.status IN ('error', 'reauth') ORDER BY s.last_sync_at DESC LIMIT 50`,
  );
  const pushes = await all<{ who: string; ua: string | null; fails: number; last_ok_at: number | null }>(
    `SELECT u.name AS who, p.ua, p.fails, p.last_ok_at FROM push_subs p JOIN users u ON u.id = p.user_id WHERE p.fails > 0 ORDER BY p.fails DESC LIMIT 50`,
  );
  const crons: Problems["crons"] = [];
  for (const name of ["sync", "recap"]) {
    const r = await one<{ updated_at: number }>("SELECT updated_at FROM app_settings WHERE key = ?", [`cron:${name}:last`]);
    crons.push({ name, at: r ? Number(r.updated_at) : null });
  }
  const people = await all<{ name: string; crews: number; sources: number; last_seen: string | null }>(
    `SELECT u.name, (SELECT COUNT(*) FROM crew_members m WHERE m.user_id = u.id) AS crews,
            (SELECT COUNT(*) FROM sources s WHERE s.user_id = u.id AND s.status != 'off') AS sources,
            (SELECT MAX(day) FROM visits v WHERE v.user_id = u.id) AS last_seen
     FROM users u WHERE u.name NOT LIKE 'QA-%' ORDER BY u.created_at DESC LIMIT 60`,
  );
  return {
    sources: sources.map((s) => ({ who: s.who, kind: s.kind, status: s.status, error: s.error, lastSyncAt: s.last_sync_at })),
    pushes: pushes.map((p) => ({ who: p.who, ua: p.ua, fails: Number(p.fails), lastOkAt: p.last_ok_at })),
    crons,
    people: people.map((p) => ({ name: p.name, crews: Number(p.crews), sources: Number(p.sources), lastSeen: p.last_seen ? Date.parse(p.last_seen) : null })),
  };
}

/** The crons leave a mark when they run, so the problems page can say when they last did. */
export async function cronMark(name: string): Promise<void> {
  await run("INSERT INTO app_settings (key, value_enc, updated_at) VALUES (?, '1', ?) ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at", [`cron:${name}:last`, now()]);
}
