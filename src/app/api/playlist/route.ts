import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { playlistFor, renamePlaylist } from "@/lib/playlist";

/** GET ?crew=: the crew's running playlist under its current name. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const crewId = new URL(req.url).searchParams.get("crew") ?? "";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  return json({ playlist: await playlistFor(auth.user.id, crewId) });
}

/** POST { crew, name } renames by hand; POST { crew, regenerate: true } goes back to the day's name. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ crew?: string; name?: string; regenerate?: boolean }>(req);
  const crewId = body?.crew ?? "";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  const name = str(body?.name, 60);
  if (name) {
    await renamePlaylist(crewId, name);
    return json({ playlist: await playlistFor(auth.user.id, crewId) });
  }
  if (body?.regenerate) return json({ playlist: await playlistFor(auth.user.id, crewId, { regenerate: true }) });
  return error("Nothing to do");
}
