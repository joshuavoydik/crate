import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { playlistFor, renamePlaylist } from "@/lib/playlist";
import * as dbm from "@/lib/db";

/** GET ?crew=&tz=: the crew's playlist for the viewer's today, plus the index of earlier days. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const u = new URL(req.url);
  const crewId = u.searchParams.get("crew") ?? "";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  const q0 = dbm.queryCount;
  const t0 = Date.now();
  const playlist = await playlistFor(auth.user.id, crewId, { tz: u.searchParams.get("tz") ?? undefined });
  const res = json({ playlist });
  if (process.env.CRATE_QLOG) res.headers.set("x-crate-queries", `${dbm.queryCount - q0} in ${Date.now() - t0}ms`);
  return res;
}

/** POST { crew, name } renames by hand; POST { crew, regenerate: true } goes back to the day's name. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ crew?: string; name?: string; regenerate?: boolean; tz?: string }>(req);
  const crewId = body?.crew ?? "";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  const name = str(body?.name, 60);
  const tz = str(body?.tz, 64) ?? undefined;
  if (name) {
    await renamePlaylist(crewId, name);
    return json({ playlist: await playlistFor(auth.user.id, crewId, { tz }) });
  }
  if (body?.regenerate) return json({ playlist: await playlistFor(auth.user.id, crewId, { regenerate: true, tz }) });
  return error("Nothing to do");
}
