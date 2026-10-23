import { NextResponse } from "next/server";
import { attachGoogle, createUser, readGoogleClaim, setSessionCookie, TakenError, userByEmail, userByGoogle } from "@/lib/auth";
import { googleIdentity } from "@/lib/google-signin";
import { appUrl } from "@/lib/app-url";

/**
 * Back from Google. Linking: the account the person is signed in to gets this Google identity.
 * Signing in: the account with this Google identity, else the one with this verified address,
 * else a new one. Either way the session is theirs afterwards.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const claim = await readGoogleClaim(q.get("state"));
  const back = (err: string) => NextResponse.redirect(`${appUrl()}${claim?.link ? "/settings" : "/signin"}?error=${err}`);
  if (!claim) return back("google-state");
  if (q.get("error") || !q.get("code")) return back("google-denied");
  let who;
  try {
    who = await googleIdentity(q.get("code")!);
  } catch {
    return back("google-failed");
  }
  if (claim.link) {
    try {
      await attachGoogle(claim.link, who.sub, who.email);
    } catch (e) {
      return back(e instanceof TakenError ? "google-taken" : "google-failed");
    }
    return NextResponse.redirect(`${appUrl()}/settings?linked=google`);
  }
  let user = await userByGoogle(who.sub);
  if (!user && who.email) {
    user = await userByEmail(who.email);
    if (user) await attachGoogle(user.id, who.sub, who.email);
  }
  const uid = user ? user.id : await createUser(who.name, { email: who.email, googleSub: who.sub });
  await setSessionCookie(uid);
  return NextResponse.redirect(`${appUrl()}${user ? claim.next : claim.next === "/" ? "/?new=1" : claim.next}`);
}
