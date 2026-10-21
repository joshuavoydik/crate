import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember, membersOf } from "@/lib/queries";
import { one } from "@/lib/db";
import { collectionById, renameCollection, deleteCollection, tracksIn, setCollectionLink, isGuest } from "@/lib/collections";

async function allowed(userId: string, collectionId: string) {
  const collection = await collectionById(collectionId);
  if (!collection) return { response: error("No such playlist", 404) };
  if (!(await isMember(userId, collection.crewId))) return { response: error("Not in that crew", 403) };
  return { collection };
}

/** GET: the playlist and its tracks, for the crew and for guests who came in by its link. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const collection = await collectionById((await ctx.params).id);
  if (!collection) return error("No such playlist", 404);
  const member = await isMember(auth.user.id, collection.crewId);
  if (!member && !(await isGuest(collection.id, auth.user.id))) return error("Not in that crew", 403);
  const crew = await one<{ id: string; name: string }>("SELECT id, name FROM crews WHERE id = ?", [collection.crewId]);
  const members = await membersOf(collection.crewId);
  const starter = members.find((m) => m.id === collection.createdBy) ?? null;
  return json({
    collection: member ? collection : { ...collection, publicCode: "" },
    tracks: await tracksIn(collection),
    crew: { id: crew?.id ?? collection.crewId, name: crew?.name ?? "", size: members.length },
    role: member ? "member" : "guest",
    starter,
  });
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
