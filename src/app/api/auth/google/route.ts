import { NextResponse } from "next/server";
import { currentUserId, safeNext, signGoogleClaim } from "@/lib/auth";
import { googleSignInConfigured, googleSignInUrl } from "@/lib/google-signin";
import { appUrl } from "@/lib/app-url";

/** GET ?next=&link=1: off to Google. With link=1 and a session, the Google account is attached to it instead of switching. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (!(await googleSignInConfigured())) return NextResponse.redirect(`${appUrl()}/signin?error=google-off`);
  const uid = await currentUserId();
  const link = q.get("link") === "1" && uid ? uid : null;
  const state = await signGoogleClaim({ next: safeNext(q.get("next")), link });
  return NextResponse.redirect(await googleSignInUrl(state));
}
