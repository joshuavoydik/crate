import { json, error, readJson, requireUser } from "@/lib/api";
import { run } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { buildMe } from "@/lib/session";

const MAX = 400_000; // ~300 KB of image, already resized in the browser

/** POST { dataUrl } sets the photo; POST { dataUrl: null } removes it. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ dataUrl?: string | null }>(req);
  if (!body) return error("Bad JSON");
  if (body.dataUrl === null) {
    await run("UPDATE users SET avatar = NULL, avatar_v = avatar_v + 1 WHERE id = ?", [auth.user.id]);
  } else {
    const d = String(body.dataUrl ?? "");
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d)) return error("Send a JPEG, PNG or WebP");
    if (d.length > MAX) return error("That image is too large");
    await run("UPDATE users SET avatar = ?, avatar_v = avatar_v + 1 WHERE id = ?", [d, auth.user.id]);
  }
  const user = await currentUser();
  return json({ me: user ? await buildMe(user) : null });
}
