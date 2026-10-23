import { attachEmail, claimOnce, createUser, readEmailLink, readSignInLink, setSessionCookie, spent, TakenError, userByEmail } from "@/lib/auth";
import { json, error, readJson, str } from "@/lib/api";
import { throttled, clientIp } from "@/lib/ratelimit";

/**
 * The button on a sign-in link. A GET never spends a link (previews and scanners fetch links;
 * people press buttons), so this is where a device link or an email link turns into a session.
 * A new address with no account yet needs a name, and gets an account on the spot.
 */
export async function POST(req: Request) {
  const slow = throttled(`finish:${clientIp(req)}`, 20);
  if (slow) return slow;
  const body = await readJson<{ token?: string; name?: string }>(req);
  const token = str(body?.token, 4000);
  if (!token) return error("No link");
  const device = await readSignInLink(token);
  const mail = device ? null : await readEmailLink(token);
  if (!device && !mail) return error("That link is not valid any more. Make a new one.", 410);
  if (await spent(token)) return error("That link was already used. Make a new one.", 410);

  let uid: string;
  let next = "/";
  if (device) {
    uid = device;
  } else {
    const m = mail!;
    next = m.next;
    if (m.link) {
      try {
        await attachEmail(m.link, m.email);
      } catch (e) {
        return error(e instanceof TakenError ? e.message : "Could not attach that address", 409);
      }
      uid = m.link;
      next = "/settings?linked=email";
    } else {
      const known = await userByEmail(m.email);
      if (known) uid = known.id;
      else {
        const name = str(body?.name, 60);
        if (!name) return json({ needName: true });
        uid = await createUser(name, { email: m.email });
        if (next === "/") next = "/?new=1";
      }
    }
  }
  if (!(await claimOnce(token))) return error("That link was already used. Make a new one.", 410);
  await setSessionCookie(uid);
  return json({ ok: true, next });
}
