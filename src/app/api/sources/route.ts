import { json, error, readJson, requireUser, str } from "@/lib/api";
import { saveSource, removeSource, sourcesFor, syncUser } from "@/lib/sync";
import { configured } from "@/lib/sources";
import { run } from "@/lib/db";
import type { SourceKind } from "@/lib/sources";

const USERNAME_KINDS: SourceKind[] = ["lastfm"];
const ALL_KINDS: SourceKind[] = ["spotify", "youtube", "apple", "soundcloud", "tidal", "lastfm"];

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const sources = (await sourcesFor(auth.user.id)).map((s) => ({ kind: s.kind, label: s.label, status: s.status, error: s.error, lastSyncAt: s.last_sync_at }));
  return json({ sources, connectors: await configured() });
}

/** Username-based sources (Last.fm): save and run a first sync right away. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ kind?: string; username?: string }>(req);
  const kind = body?.kind as SourceKind;
  if (!USERNAME_KINDS.includes(kind)) return error("That source needs a sign-in, not a username");
  const username = str(body?.username, 80);
  if (!username) return error("Enter a username");
  if (kind === "lastfm" && !(await configured()).lastfm) return error("Last.fm needs an API key first (Set up)", 501);
  await saveSource({ userId: auth.user.id, kind, label: username, token: null });
  if (kind === "lastfm") await run("UPDATE users SET lastfm_user = ? WHERE id = ?", [username, auth.user.id]);
  const reports = await syncUser(auth.user.id, { force: true, only: kind });
  return json({ ok: true, reports });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const kind = new URL(req.url).searchParams.get("kind") as SourceKind;
  if (!ALL_KINDS.includes(kind)) return error("Unknown source");
  await removeSource(auth.user.id, kind);
  return json({ ok: true });
}
