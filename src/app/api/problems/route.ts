import { json, error, requireUser, readJson, str } from "@/lib/api";
import { isMaker } from "@/lib/maker";
import { problems } from "@/lib/problems";
import { isMember, joinCrew, crewsFor } from "@/lib/queries";
import { one } from "@/lib/db";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!(await isMaker(auth.user.id))) return error("Not yours", 403);
  return json(await problems());
}

/**
 * POST { userId, crewId }: bring someone on this Crate into one of the maker's own crews. For the
 * friend who started a crew of their own instead of using the invite; the maker can see it from
 * here, and one press puts them where they meant to be.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!(await isMaker(auth.user.id))) return error("Not yours", 403);
  const body = await readJson<{ userId?: string; crewId?: string }>(req);
  const userId = str(body?.userId, 40);
  const crewId = str(body?.crewId, 40);
  if (!userId || !crewId) return error("userId and crewId required");
  if (!(await isMember(auth.user.id, crewId))) return error("Not your crew", 403);
  const u = await one<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ?", [userId]);
  if (!u) return error("No such person", 404);
  await joinCrew(crewId, userId);
  const crew = (await crewsFor(auth.user.id)).find((c) => c.id === crewId);
  return json({ ok: true, name: u.name, crew: crew?.name ?? "" });
}
