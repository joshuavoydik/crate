import { NextResponse } from "next/server";
import { readSessionToken, setSessionCookie } from "@/lib/auth";
import { appUrl } from "@/lib/session";

/** A signed link that logs its person in on this address; handed out by the import. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? undefined;
  const uid = await readSessionToken(token);
  if (!uid) return NextResponse.redirect(`${appUrl()}/?signin=invalid`);
  await setSessionCookie(uid);
  return NextResponse.redirect(`${appUrl()}/`);
}
