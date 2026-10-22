import { currentUser, createUser, setSessionCookie } from "@/lib/auth";
import { json, error, readJson, str } from "@/lib/api";
import { createCrew } from "@/lib/queries";
import { buildMe } from "@/lib/session";
import { throttled, clientIp } from "@/lib/ratelimit";

/** Creates a crew. Signs the caller up on the spot when they have no session yet. */
export async function POST(req: Request) {
  const slow = throttled(`crews:${clientIp(req)}`, 10);
  if (slow) return slow;
  const body = await readJson<{ name?: string; yourName?: string }>(req);
  if (!body) return error("Bad JSON");
  const crewName = str(body.name, 60) ?? "Us";
  let user = await currentUser();
  if (!user) {
    const yourName = str(body.yourName, 60);
    if (!yourName) return error("Tell us your name first");
    const uid = await createUser(yourName);
    await setSessionCookie(uid);
    user = { id: uid, name: yourName, isDj: false, preferredPlatform: "", lastfmUser: null };
  }
  const crew = await createCrew(crewName, user.id);
  return json({ crew, me: await buildMe(user) });
}
