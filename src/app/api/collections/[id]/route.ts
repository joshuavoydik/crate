import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { collectionById, renameCollection, deleteCollection, tracksIn, setCollectionLink } from "@/lib/collections";

async function allowed(userId: string, collectionId: string) {
  const collection = await collectionById(collectionId);
  if (!collection) return { response: error("No such playlist", 404) };
  if (!(await isMember(userId, collection.crewId))) return { response: error("Not in that crew", 403) };
  return { collection };
}

/** GET: the playlist and its tracks. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const got = await allowed(auth.user.id, (await ctx.params).id);
  if ("response" in got) return got.response;
  return json({ collection: got.collection, tracks: await tracksIn(got.collection) });
}

/** PATCH { name } renames; PATCH { link: true | false } turns the share link on or off. Any member may. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const got = await allowed(auth.user.id, (await ctx.params).id);
  if ("response" in got) return got.response;
  const body = await readJson<{ name?: string; link?: boolean }>(req);
  if (!body) return error("Bad JSON");
  if (typeof body.link === "boolean") await setCollectionLink(got.collection.id, body.link);
  if (body.name !== undefined) {
    const name = str(body.name, 60);
    if (!name) return error("Give it a name");
    await renameCollection(got.collection.id, name);
  }
  return json({ collection: await collectionById(got.collection.id) });
}

/** DELETE: the playlist goes; the tracks stay in the crew's stream and everyone's logs. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const got = await allowed(auth.user.id, (await ctx.params).id);
  if ("response" in got) return got.response;
  await deleteCollection(got.collection.id);
  return json({ ok: true });
}
