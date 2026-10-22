import { NextResponse } from "next/server";
import { readSignInLink, setSessionCookie } from "@/lib/auth";
import { appUrl } from "@/lib/session";
import { one, run, now } from "@/lib/db";
import { sha256base64url } from "@/lib/crypto";

/** A signed link that logs its person in on this address: handed out by the import, or made in Settings for another device. One use each. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? undefined;
  const uid = await readSignInLink(token);
  if (!uid) return NextResponse.redirect(`${appUrl()}/?signin=invalid`);
  const mark = `signin:${sha256base64url(token!)}`;
  const used = await one("SELECT 1 AS x FROM app_settings WHERE key = ?", [mark]);
  if (used) return NextResponse.redirect(`${appUrl()}/?signin=used`);
  await run("INSERT INTO app_settings (key, value_enc, updated_at) VALUES (?, '1', ?)", [mark, now()]);
  // Marks outlive the links they guard by a day; older ones go.
  await run("DELETE FROM app_settings WHERE key LIKE 'signin:%' AND updated_at < ?", [now() - 2 * 86400000]);
  await setSessionCookie(uid);
  return NextResponse.redirect(`${appUrl()}/`);
}
