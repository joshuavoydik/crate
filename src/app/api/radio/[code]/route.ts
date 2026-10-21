import { json, error } from "@/lib/api";
import { crewByPublicCode, publicSends } from "@/lib/playlist";
import { liveFor, liveHistoryFor, tuneIn, tunedInDetail } from "@/lib/live";

/** Public radio feed: no sign-in. Who is playing what, and the playlist. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const crew = await crewByPublicCode(code);
  if (!crew) return error("No such station", 404);
  const viewer = new URL(req.url).searchParams.get("v");
  if (viewer && /^[A-Za-z0-9_-]{6,40}$/.test(viewer)) await tuneIn(crew.id, `anon:${viewer}`);
  const [people, sends, history] = await Promise.all([liveFor(crew.id), publicSends(crew.id, 60), liveHistoryFor(crew.id, 40)]);
  const tuned = await tunedInDetail(crew.id);
  return json({ crew: { name: crew.name, playlistName: crew.playlistName }, people, sends, history, tunedIn: tuned.count, tuned, now: Date.now() });
}
