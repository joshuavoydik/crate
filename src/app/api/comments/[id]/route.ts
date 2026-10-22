import { json, error, requireUser } from "@/lib/api";
import { deleteComment } from "@/lib/comments";

/** Your own comment, gone. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await deleteComment(id, auth.user.id))) return error("Not yours, or already gone", 404);
  return json({ ok: true });
}
