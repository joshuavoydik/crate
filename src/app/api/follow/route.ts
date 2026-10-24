import { json, error, readJson, requireUser, str } from "@/lib/api";
import { profileByHandle, follow, unfollow, followerCount } from "@/lib/profile";

/** POST { handle } follows; DELETE { handle } unfollows. One-way, no invite, no crew. */
export async function POST(req: Request) {
  return change(req, true);
}

export async function DELETE(req: Request) {
  return change(req, false);
}

async function change(req: Request, on: boolean) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ handle?: string }>(req);
  const handle = str(body?.handle, 30);
  const p = handle ? await profileByHandle(handle) : null;
  if (!p || p.level === "off") return error("No such page", 404);
  if (p.person.id === auth.user.id) return error("That is you");
  if (on) await follow(auth.user.id, p.person.id);
  else await unfollow(auth.user.id, p.person.id);
  return json({ following: on, followers: await followerCount(p.person.id) });
}
