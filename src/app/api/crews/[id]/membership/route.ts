import { json, error, requireUser } from "@/lib/api";
import { all, run } from "@/lib/db";
import { isMember } from "@/lib/queries";
import { buildMe } from "@/lib/session";

/** Leave a crew. The last person out takes the crew and its sends with them. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await isMember(auth.user.id, id))) return error("Not in that crew", 403);
  await run("DELETE FROM crew_members WHERE crew_id = ? AND user_id = ?", [id, auth.user.id]);
  const left = await all<{ user_id: string }>("SELECT user_id FROM crew_members WHERE crew_id = ?", [id]);
  if (!left.length) {
    await run("DELETE FROM reactions WHERE send_id IN (SELECT id FROM sends WHERE crew_id = ?)", [id]);
    await run("DELETE FROM sends WHERE crew_id = ?", [id]);
    await run("DELETE FROM crews WHERE id = ?", [id]);
  }
  return json({ me: await buildMe(auth.user) });
}
