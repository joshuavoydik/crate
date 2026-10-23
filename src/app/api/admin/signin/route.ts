import { NextResponse } from "next/server";
import { appUrl } from "@/lib/session";

/**
 * Older sign-in links came here and were spent on arrival, which let a messaging app's link preview
 * use them up before the person tapped. They now land on the page with the button.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return NextResponse.redirect(`${appUrl()}/signin/link?token=${encodeURIComponent(token)}`);
}
