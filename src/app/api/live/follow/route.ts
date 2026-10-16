import { json, error, readJson, requireUser } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { followAlong } from "@/lib/live";

/** POST { crew, userId }: play what that person is playing on the caller's own Spotify. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ crew?: string; userId?: string }>(req);
  const crewId = body?.crew ?? "";
  const userId = body?.userId ?? "";
  if (!crewId || !userId) return error("crew and userId required");
  if (!(await isMember(auth.user.id, crewId)) || !(await isMember(userId, crewId))) return error("Not in that crew", 403);
  if (userId === auth.user.id) return error("That is you");
  try {
    return json(await followAlong(auth.user.id, userId));
  } catch (e) {
    return error((e as Error).message, 409);
  }
}
