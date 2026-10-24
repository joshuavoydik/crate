import { json, error } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { profileByHandle, publicPlaylistsOf, liveOne, recentPlaysOf, followerCount, isFollowing } from "@/lib/profile";
import { throttled, clientIp } from "@/lib/ratelimit";

/**
 * A person's page as data: no sign-in needed. What it carries follows what they chose to show;
 * off means the page is not there, except to its owner, who sees it with a note.
 */
export async function GET(req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const slow = throttled(`profile:${clientIp(req)}`, 60);
  if (slow) return slow;
  const { handle } = await ctx.params;
  const profile = await profileByHandle(handle);
  const me = await currentUser();
  const self = !!me && !!profile && me.id === profile.person.id;
  if (!profile || (profile.level === "off" && !self)) return error("No such page", 404);
  const showPlays = profile.level === "plays";
  const [live, plays, playlists, followers, following] = await Promise.all([
    showPlays ? liveOne(profile.person) : null,
    showPlays ? recentPlaysOf(profile.person, 30) : [],
    publicPlaylistsOf(profile.person.id),
    followerCount(profile.person.id),
    me && !self ? isFollowing(me.id, profile.person.id) : false,
  ]);
  return json({
    person: profile.person,
    handle: profile.handle,
    level: profile.level,
    live,
    plays,
    playlists,
    followers,
    following,
    self,
    signedIn: !!me,
    now: Date.now(),
  });
}
