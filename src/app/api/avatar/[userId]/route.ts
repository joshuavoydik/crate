import { one } from "@/lib/db";

/** A person's photo, stored as a small data URL. Cached hard; the URL carries a version. */
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  const row = await one<{ avatar: string | null }>("SELECT avatar FROM users WHERE id = ?", [userId]);
  const data = row?.avatar;
  if (!data) return new Response("Not found", { status: 404 });
  const m = data.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "public, max-age=31536000, immutable" },
  });
}
