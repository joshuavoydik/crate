import { currentUser, normalizeEmail, safeNext, signEmailLink, userByEmail } from "@/lib/auth";
import { json, error, readJson } from "@/lib/api";
import { mailConfigured, sendMail, signInMail } from "@/lib/mail";
import { appUrl } from "@/lib/app-url";
import { throttled, clientIp } from "@/lib/ratelimit";

/**
 * POST { email, next?, link? }: a sign-in link to that address. With link and a session, the link
 * attaches the address to this account instead. The reply says the same thing whether or not
 * the address is known: the inbox is where the answer is.
 */
export async function POST(req: Request) {
  const slow = throttled(`email:${clientIp(req)}`, 8) ?? null;
  if (slow) return slow;
  const body = await readJson<{ email?: string; next?: string; link?: boolean }>(req);
  const email = normalizeEmail(body?.email);
  if (!email) return error("That does not look like an email address");
  if (!(await mailConfigured())) return error("Email sign-in is not switched on in this Crate yet", 501);
  const per = throttled(`email:to:${email}`, 4);
  if (per) return per;
  const me = body?.link ? await currentUser() : null;
  if (body?.link && !me) return error("Sign in first", 401);
  const token = await signEmailLink({ email, next: safeNext(body?.next), link: me?.id ?? null });
  const link = `${appUrl()}/signin/link?token=${encodeURIComponent(token)}`;
  const known = await userByEmail(email);
  const lead = me ? `Press the button to attach ${email} to ${me.name}'s Crate account.` : known ? `Welcome back, ${known.name.split(" ")[0]}.` : null;
  const m = signInMail(link, lead);
  try {
    await sendMail(email, m.subject, m.text, m.html);
  } catch (e) {
    return error((e as Error).message, 502);
  }
  return json({ ok: true });
}
