import { json, error, readJson, str } from "@/lib/api";
import { currentUser, createUser, setSessionCookie } from "@/lib/auth";
import { collectionByPublicCode, tracksIn, isGuest, addGuest } from "@/lib/collections";
import { isMember, createCrew } from "@/lib/queries";
import { throttled, clientIp } from "@/lib/ratelimit";

/**
 * A playlist by its share link: no sign-in needed to look. The list, the tracks, who added each.
 * Previews and outbound links stay behind sign-up: a friend sees what is here, and hears it once
 * they are in. Someone already in (a member or a guest) is pointed into the app.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const found = await collectionByPublicCode(code);
  if (!found) return error("No such playlist", 404);
  const user = await currentUser();
  if (user && ((await isMember(user.id, found.collection.crewId)) || (await isGuest(found.collection.id, user.id)))) {
    return json({ open: `/playlists/${found.collection.id}` });
  }
  const tracks = await tracksIn(found.collection);
  return json({
    playlist: { name: found.collection.name, crewName: found.crewName, count: tracks.length, createdAt: found.collection.createdAt },
    tracks: tracks.map((t) => ({
      track: { ...t.track, previewUrl: null, links: {} },
      addedBy: { name: t.addedBy.name.split(" ")[0], avatarUrl: t.addedBy.avatarUrl },
      addedAt: t.addedAt,
    })),
    signedIn: !!user,
  });
}

/**
 * POST { yourName? }: come in to hear it. With no session this makes an account (and a crew of
 * their own, so the app has a home for them); either way the person becomes a guest of this
 * playlist and is sent to it inside the app.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const slow = throttled(`pjoin:${clientIp(req)}`, 10);
  if (slow) return slow;
  const { code } = await ctx.params;
  const found = await collectionByPublicCode(code);
  if (!found) return error("No such playlist", 404);
  const body = (await readJson<{ yourName?: string }>(req)) ?? {};
  let user = await currentUser();
  if (!user) {
    const yourName = str(body.yourName, 60);
    if (!yourName) return error("Tell us your name first");
    const uid = await createUser(yourName);
    await createCrew(`${yourName.split(" ")[0]}'s crew`, uid);
    await setSessionCookie(uid);
    user = { id: uid, name: yourName, isDj: false, preferredPlatform: "apple", lastfmUser: null };
  }
  if (!(await isMember(user.id, found.collection.crewId))) await addGuest(found.collection.id, user.id);
  return json({ open: `/playlists/${found.collection.id}` });
}
