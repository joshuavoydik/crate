import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember, getTrack } from "@/lib/queries";
import { collectionsFor, createCollection, addTrack } from "@/lib/collections";

/** GET ?crew=&track=: the crew's playlists (with whether each holds that track). */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const q = new URL(req.url).searchParams;
  const crewId = q.get("crew") ?? "";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  return json({ collections: await collectionsFor(crewId, q.get("track")) });
}

/** POST { crew, name, trackId? }: a new playlist, with a first track when one is given. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ crew?: string; name?: string; trackId?: string }>(req);
  const crewId = str(body?.crew, 40);
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  const name = str(body?.name, 60);
  if (!name) return error("Give it a name");
  const trackId = str(body?.trackId, 40);
  if (trackId && !(await getTrack(trackId))) return error("Unknown track", 404);
  let collection = await createCollection(crewId, auth.user.id, name);
  if (trackId) {
    await addTrack(collection.id, trackId, auth.user.id);
    collection = { ...collection, count: 1 };
  }
  return json({ collection });
}
