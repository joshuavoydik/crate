import { json, requireUser } from "@/lib/api";
import { followingFeed } from "@/lib/profile";

/** GET: the people this person follows, live ones first, and their recent public plays. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const feed = await followingFeed(auth.user.id);
  return json({ ...feed, now: Date.now() });
}
