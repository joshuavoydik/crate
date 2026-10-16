import { json, error, requireUser } from "@/lib/api";
import { one, run } from "@/lib/db";

/**
 * Removes one Log item for the caller. Ids are the Log's own:
 *   log:<id>      a liked / played / received entry → deleted
 *   sent:<sendId> your own send → deleted for everyone (with its reactions)
 *   kept:<sendId> your keep / played-out on someone's send → the reaction is removed
 *   keptlog:<id>  a received link you kept → back to unkept
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const [kind, ...rest] = id.split(":");
  const key = rest.join(":");
  if (!key) return error("Bad id");
  const uid = auth.user.id;
  if (kind === "log") {
    const n = await run("DELETE FROM log_entries WHERE id = ? AND user_id = ?", [key, uid]);
    return n ? json({ ok: true }) : error("Not found", 404);
  }
  if (kind === "sent") {
    const s = await one<{ from_user_id: string }>("SELECT from_user_id FROM sends WHERE id = ?", [key]);
    if (!s) return error("Not found", 404);
    if (s.from_user_id !== uid) return error("Not your send", 403);
    await run("DELETE FROM reactions WHERE send_id = ?", [key]);
    await run("DELETE FROM sends WHERE id = ?", [key]);
    return json({ ok: true });
  }
  if (kind === "kept") {
    const n = await run("DELETE FROM reactions WHERE send_id = ? AND user_id = ?", [key, uid]);
    return n ? json({ ok: true }) : error("Not found", 404);
  }
  if (kind === "keptlog") {
    const n = await run("UPDATE log_entries SET status = 'skipped', reply = NULL, status_at = ? WHERE id = ? AND user_id = ?", [Date.now(), key, uid]);
    return n ? json({ ok: true }) : error("Not found", 404);
  }
  return error("Bad id");
}
