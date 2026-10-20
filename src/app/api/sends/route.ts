import { json, error, readJson, requireUser, str } from "@/lib/api";
import { createSend, getTrack, isMember, reelFor, sendsIn } from "@/lib/queries";
import { receivedUnheard } from "@/lib/log";
import { throttled } from "@/lib/ratelimit";

/** GET ?crew=...&view=reel|all */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const crewId = url.searchParams.get("crew") ?? "";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  const view = url.searchParams.get("view") ?? "reel";
  if (view === "all") return json({ sends: await sendsIn(auth.user.id, crewId) });
  // The reel is what the crew sent plus links that reached this person from outside (iMessage).
  const sends = [...(await reelFor(auth.user.id, crewId)), ...(await receivedUnheard(auth.user.id))].sort((a, b) => a.createdAt - b.createdAt);
  return json({ sends });
}

/** POST { crewId, trackId, note?, noteBy?, sourceUrl? } */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const slow = throttled(`sends:${auth.user.id}`, 60);
  if (slow) return slow;
  const body = await readJson<{ crewId?: string; trackId?: string; note?: string; noteBy?: string; sourceUrl?: string }>(req);
  if (!body) return error("Bad JSON");
  const crewId = str(body.crewId, 80);
  const trackId = str(body.trackId, 80);
  if (!crewId || !trackId) return error("Missing crew or track");
  if (!(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  const track = await getTrack(trackId);
  if (!track) return error("Unknown track", 404);
  const note = str(body.note, 280);
  const noteBy = body.noteBy === "agent" ? "agent" : "human";
  const send = await createSend({
    crewId,
    trackId,
    fromUserId: auth.user.id,
    note,
    noteBy: note ? noteBy : "human",
    sourceUrl: str(body.sourceUrl, 2000),
  });
  return json({ send }, 201);
}
