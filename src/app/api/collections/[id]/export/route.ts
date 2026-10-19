export const maxDuration = 60;

import { json, error, readJson, requireUser } from "@/lib/api";
import { isMember, membersOf } from "@/lib/queries";
import { one } from "@/lib/db";
import { collectionById } from "@/lib/collections";
import { exportCollection, ExportError, type ExportTarget } from "@/lib/export";

/**
 * POST { to: "spotify" | "apple" }: this playlist, saved to the caller's own Spotify or Apple Music.
 * 409 with reconnect: true when their sign-in there predates the permission this needs.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const collection = await collectionById(id);
  if (!collection) return error("No such playlist", 404);
  if (!(await isMember(auth.user.id, collection.crewId))) return error("Not in that crew", 403);
  const body = await readJson<{ to?: string }>(req);
  const to = body?.to;
  if (to !== "spotify" && to !== "apple") return error("Where to? spotify or apple");
  await membersOf(collection.crewId);
  const crew = await one<{ name: string }>("SELECT name FROM crews WHERE id = ?", [collection.crewId]);
  try {
    const r = await exportCollection(auth.user.id, collection, crew?.name ?? "a crew", to as ExportTarget);
    return json({ ...r, to });
  } catch (e) {
    if (e instanceof ExportError) return json({ error: e.message, code: e.code, reconnect: e.code === "reconnect" }, e.code === "reconnect" ? 409 : 400);
    return error((e as Error).message.slice(0, 200), 502);
  }
}
