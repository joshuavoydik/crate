import { json, error, readJson, requireUser, str } from "@/lib/api";
import { getSend, isMember } from "@/lib/queries";
import { commentsOn, addComment, announceComment } from "@/lib/comments";
import { throttled } from "@/lib/ratelimit";

/** The thread under a send: GET lists it, POST { body } adds to it. Crew members only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const send = await getSend(id, auth.user.id);
  if (!send) return error("No such send", 404);
  if (!(await isMember(auth.user.id, send.crewId))) return error("Not in that crew", 403);
  return json({ comments: await commentsOn(id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const slow = throttled(`comments:${auth.user.id}`, 60);
  if (slow) return slow;
  const { id } = await ctx.params;
  const send = await getSend(id, auth.user.id);
  if (!send) return error("No such send", 404);
  if (!(await isMember(auth.user.id, send.crewId))) return error("Not in that crew", 403);
  const body = await readJson<{ body?: string }>(req);
  const text = str(body?.body, 500);
  if (!text) return error("Say something");
  const comment = await addComment(id, auth.user.id, text);
  announceComment(send, auth.user, text).catch(() => undefined);
  return json({ comment, comments: await commentsOn(id) }, 201);
}
