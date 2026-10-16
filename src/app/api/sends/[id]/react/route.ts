import { json, error, readJson, requireUser, str } from "@/lib/api";
import { getSend, isMember, react } from "@/lib/queries";
import { isLogId, reactToLog, receivedById } from "@/lib/log";
import type { ReactionStatus } from "@/lib/types";

const STATUSES: ReactionStatus[] = ["seen", "skipped", "saved", "played"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson<{ status?: string; reply?: string | null }>(req);
  if (!body) return error("Bad JSON");
  const status = body.status as ReactionStatus;
  if (!STATUSES.includes(status)) return error("Bad status");
  if (isLogId(id)) {
    const existing = await receivedById(auth.user.id, id);
    if (!existing) return error("No such item", 404);
    const r = body.reply === undefined ? undefined : body.reply === null ? null : str(body.reply, 200);
    await reactToLog(auth.user.id, id, status, r);
    return json({ send: await receivedById(auth.user.id, id) });
  }
  const send = await getSend(id, auth.user.id);
  if (!send) return error("No such send", 404);
  if (!(await isMember(auth.user.id, send.crewId))) return error("Not in that crew", 403);
  if (send.from.id === auth.user.id) return error("You can't react to your own send", 400);
  const reply = body.reply === undefined ? undefined : body.reply === null ? null : str(body.reply, 200);
  await react(id, auth.user.id, status, reply);
  return json({ send: await getSend(id, auth.user.id) });
}
