import { json, error } from "@/lib/api";
import { collectionByPublicCode, tracksIn } from "@/lib/collections";

/** A playlist by its share link: no sign-in. The list, the tracks, who added each. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const found = await collectionByPublicCode(code);
  if (!found) return error("No such playlist", 404);
  const tracks = await tracksIn(found.collection);
  return json({
    playlist: { name: found.collection.name, crewName: found.crewName, count: tracks.length, createdAt: found.collection.createdAt },
    tracks: tracks.map((t) => ({ track: t.track, addedBy: { name: t.addedBy.name, avatarUrl: t.addedBy.avatarUrl }, addedAt: t.addedAt })),
  });
}
