import { one } from "./db";

/**
 * The maker: whoever runs this Crate. The first person who ever signed up, plus anyone named in
 * CRATE_MAKERS (comma-separated user ids). Only they may see or change the deployment's connector
 * keys; everyone else just uses the connections.
 */
export async function isMaker(userId: string): Promise<boolean> {
  const listed = (process.env.CRATE_MAKERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (listed.includes(userId)) return true;
  const first = await one<{ id: string }>("SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1");
  return first?.id === userId;
}

/**
 * Whether this person has any business with a track: it is in a crew they belong to, in their own
 * log, on their own turntable, or not in anyone's crew yet (a link they just pasted). Tracks are
 * shared by everyone on the instance, so a stranger must not be able to rewrite one.
 */
export async function canTouchTrack(userId: string, trackId: string): Promise<boolean> {
  const row = await one<{ x: number }>(
    `SELECT 1 AS x WHERE EXISTS (
       SELECT 1 FROM sends s JOIN crew_members m ON m.crew_id = s.crew_id WHERE s.track_id = ? AND m.user_id = ?)
     OR EXISTS (SELECT 1 FROM log_entries WHERE track_id = ? AND user_id = ?)
     OR EXISTS (SELECT 1 FROM presence WHERE track_id = ? AND user_id = ?)
     OR NOT EXISTS (SELECT 1 FROM sends WHERE track_id = ?)`,
    [trackId, userId, trackId, userId, trackId, userId, trackId],
  );
  return !!row;
}
