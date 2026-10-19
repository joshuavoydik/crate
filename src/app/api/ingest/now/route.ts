export const maxDuration = 60;

import { json, error, readJson, str } from "@/lib/api";
import { userByIngestToken } from "@/lib/ingest";
import { reportFromMac } from "@/lib/live";
import { parseNowLines, permissionProblem } from "@/lib/mac";
import { run } from "@/lib/db";

/**
 * POST /api/ingest/now with "Authorization: Bearer crate_..." from the Mac helper. Either the
 * AppleScript's raw tab-separated lines as text/plain (empty body: nothing playing), or JSON
 * { now: { source, title, artist, album?, durationMs?, positionMs?, url? } | null }.
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

/** The Chrome extension posts from its own origin; the token is the credential, so any origin may ask. */
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function withCors(r: Response): Response {
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

export async function POST(req: Request) {
  return withCors(await post(req));
}

async function post(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const user = await userByIngestToken(token);
  if (!user) return error("Bad ingest token", 401);
  if (!/json/i.test(req.headers.get("content-type") ?? "")) {
    const text = await req.text().catch(() => "");
    const parsed = parseNowLines(text);
    // An app that refuses to answer is something the person can fix once; the bell says which.
    await run("UPDATE users SET mac_blocked = ?, mac_last = ?, mac_seen_at = ? WHERE id = ?", [permissionProblem(parsed.errors), text.slice(0, 2000), Date.now(), user.id]);
    await reportFromMac(user.id, parsed.now);
    return json({ ok: true });
  }
  const body = await readJson<{ now?: Record<string, unknown> | null }>(req);
  if (!body) return error("Bad JSON");
  const n = body.now;
  // What Chrome last said, and when: the line on the Crate in Chrome page that shows it is alive.
  await run("UPDATE users SET chrome_seen_at = ?, chrome_last = ? WHERE id = ?", [Date.now(), n ? JSON.stringify(n).slice(0, 2000) : null, user.id]);
  if (!n) {
    await reportFromMac(user.id, null);
    return json({ ok: true });
  }
  const source = str(n.source, 20);
  const title = str(n.title, 300);
  if (!source || !title) return error("source and title required");
  await reportFromMac(user.id, {
    source,
    title,
    artist: str(n.artist, 300) ?? "",
    album: str(n.album, 300),
    durationMs: typeof n.durationMs === "number" && n.durationMs > 0 ? n.durationMs : null,
    positionMs: typeof n.positionMs === "number" && n.positionMs >= 0 ? n.positionMs : null,
    url: str(n.url, 1000),
  });
  return json({ ok: true });
}
