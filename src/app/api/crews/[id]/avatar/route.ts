import { json, error, readJson, requireUser } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { one, run } from "@/lib/db";
import { buildMe } from "@/lib/session";

const MAX = 400_000;

/** The crew's picture. Cached hard; the URL carries a version. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await one<{ avatar: string | null }>("SELECT avatar FROM crews WHERE id = ?", [id]);
  const m = row?.avatar?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), { headers: { "content-type": m[1], "cache-control": "public, max-age=31536000, immutable" } });
}

/** POST { dataUrl } sets it; { dataUrl: null } removes it. Any member may. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await isMember(auth.user.id, id))) return error("Not in that crew", 403);
  const body = await readJson<{ dataUrl?: string | null }>(req);
  if (!body) return error("Bad JSON");
  if (body.dataUrl === null) {
    await run("UPDATE crews SET avatar = NULL, avatar_v = avatar_v + 1 WHERE id = ?", [id]);
  } else {
    const d = String(body.dataUrl ?? "");
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d)) return error("Send a JPEG, PNG or WebP");
    if (d.length > MAX) return error("That image is too large");
    await run("UPDATE crews SET avatar = ?, avatar_v = avatar_v + 1 WHERE id = ?", [d, id]);
  }
  return json({ me: await buildMe(auth.user) });
}
