import { json, error, requireUser } from "@/lib/api";
import { one, run } from "@/lib/db";
import { getSend, isMember } from "@/lib/queries";
import { isLogId, receivedById } from "@/lib/log";

/** One send (or a received link, id "log:...") as the viewer sees it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (isLogId(id)) {
    const s = await receivedById(auth.user.id, id);
    return s ? json({ send: s }) : error("No such item", 404);
  }
  const send = await getSend(id, auth.user.id);
  if (!send || !(await isMember(auth.user.id, send.crewId))) return error("No such send", 404);
  return json({ send });
}

/** Unsend: only your own send, within ten minutes. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const s = await one<{ from_user_id: string; created_at: number }>("SELECT from_user_id, created_at FROM sends WHERE id = ?", [id]);
  if (!s) return error("No such send", 404);
  if (s.from_user_id !== auth.user.id) return error("Not your send", 403);
  if (Date.now() - Number(s.created_at) > 10 * 60 * 1000) return error("Too late to unsend", 409);
  await run("DELETE FROM reactions WHERE send_id = ?", [id]);
  await run("DELETE FROM sends WHERE id = ?", [id]);
  return json({ ok: true });
}
