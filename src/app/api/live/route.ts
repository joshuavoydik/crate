export const maxDuration = 60;

import { json, error, readJson, requireUser } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { heartbeat, liveFor, liveHistoryFor, tuneIn, tunedIn } from "@/lib/live";

/** GET: who is playing what, right now, in a crew. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const crewId = new URL(req.url).searchParams.get("crew") ?? "";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  const q = new URL(req.url).searchParams;
  if (q.get("tune") === "1") await tuneIn(crewId, auth.user.id);
  const people = await liveFor(crewId);
  const history = q.get("history") === "1" ? await liveHistoryFor(crewId) : [];
  return json({ people, history, tunedIn: await tunedIn(crewId), now: Date.now() });
}

/** POST: the Crate player reporting a preview playing or paused. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{
    trackId?: string;
    playing?: boolean;
    progressMs?: number;
    durationMs?: number;
  }>(req);
  if (!body?.trackId) return error("trackId required");
  await heartbeat(auth.user.id, {
    trackId: String(body.trackId),
    playing: !!body.playing,
    progressMs: typeof body.progressMs === "number" && isFinite(body.progressMs) ? Math.max(0, Math.round(body.progressMs)) : null,
    durationMs: typeof body.durationMs === "number" && isFinite(body.durationMs) ? Math.max(0, Math.round(body.durationMs)) : null,
  });
  return json({ ok: true });
}
