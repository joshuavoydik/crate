import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember, getTrack } from "@/lib/queries";
import { collectionById, addTrack, removeTrack } from "@/lib/collections";

async function allowed(userId: string, collectionId: string) {
  const collection = await collectionById(collectionId);
  if (!collection) return { response: error("No such playlist", 404) };
  if (!(await isMember(userId, collection.crewId))) return { response: error("Not in that crew", 403) };
  return { collection };
}

/** POST { trackId }: put a track in. Already there is fine; the answer says so. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const got = await allowed(auth.user.id, (await ctx.params).id);
  if ("response" in got) return got.response;
  const body = await readJson<{ trackId?: string }>(req);
  const trackId = str(body?.trackId, 40);
  if (!trackId || !(await getTrack(trackId))) return error("Unknown track", 404);
  const added = await addTrack(got.collection.id, trackId, auth.user.id);
  return json({ added, collection: await collectionById(got.collection.id) });
}

/** DELETE ?track=: take a track out. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const got = await allowed(auth.user.id, (await ctx.params).id);
  if ("response" in got) return got.response;
  const trackId = new URL(req.url).searchParams.get("track") ?? "";
  if (!trackId) return error("Which track?");
  await removeTrack(got.collection.id, trackId);
  return json({ collection: await collectionById(got.collection.id) });
}
