import { currentUser } from "@/lib/auth";
import { json, error, readJson, requireUser, str } from "@/lib/api";
import { run } from "@/lib/db";
import { buildMe } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return json({ me: null });
  return json({ me: await buildMe(user) });
}

export async function PATCH(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ name?: string; isDj?: boolean; preferredPlatform?: string; lastfmUser?: string | null; imessageHandle?: string | null }>(req);
  if (!body) return error("Bad JSON");
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const name = str(body.name, 60);
  if (name) {
    sets.push("name = ?");
    args.push(name);
  }
  if (typeof body.isDj === "boolean") {
    sets.push("is_dj = ?");
    args.push(body.isDj ? 1 : 0);
  }
  const platform = str(body.preferredPlatform, 30);
  if (platform) {
    sets.push("preferred_platform = ?");
    args.push(platform);
  }
  if (body.lastfmUser !== undefined) {
    sets.push("lastfm_user = ?");
    args.push(str(body.lastfmUser, 60));
  }
  if (body.imessageHandle !== undefined) {
    sets.push("imessage_handle = ?");
    args.push(str(body.imessageHandle, 80));
  }
  if (sets.length) {
    args.push(auth.user.id);
    await run(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args);
  }
  const user = await currentUser();
  return json({ me: user ? await buildMe(user) : null });
}
