import { currentUser, createUser, setSessionCookie } from "@/lib/auth";
import { json, error, readJson, str } from "@/lib/api";
import { crewByCode, joinCrew } from "@/lib/queries";
import { buildMe } from "@/lib/session";

/** A crew is a group of friends, not a feed: this many is plenty, and the invite link works for all of them. */
const CREW_MAX = 12;

/** Joins a crew by invite code; creates the user when there is no session. */
export async function POST(req: Request) {
  const body = await readJson<{ code?: string; yourName?: string }>(req);
  if (!body) return error("Bad JSON");
  const code = str(body.code, 40);
  if (!code) return error("Missing invite code");
  const crew = await crewByCode(code);
  if (!crew) return error("That invite link is not valid", 404);
  let user = await currentUser();
  if (!user) {
    const yourName = str(body.yourName, 60);
    if (!yourName) return error("Tell us your name first");
    const uid = await createUser(yourName);
    await setSessionCookie(uid);
    user = { id: uid, name: yourName, isDj: false, preferredPlatform: "apple", lastfmUser: null };
  }
  if (crew.members.length >= CREW_MAX && !crew.members.some((m) => m.id === user!.id)) {
    return error(`This crew is full (${CREW_MAX} people)`, 409);
  }
  await joinCrew(crew.id, user.id);
  return json({ crew: await crewByCode(code), me: await buildMe(user) });
}

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const crew = await crewByCode(code);
  if (!crew) return error("That invite link is not valid", 404);
  return json({ crew: { id: crew.id, name: crew.name, members: crew.members.map((m) => ({ name: m.name })) } });
}
