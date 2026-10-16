import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember, setAutoShare } from "@/lib/queries";
import type { AutoShare } from "@/lib/types";
import { buildMe } from "@/lib/session";
import { renameCrew, setPublicRadio } from "@/lib/playlist";

/** PATCH { autoShare } (the caller's own rule), { name } (the crew's name), { publicRadio } (on or off). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await isMember(auth.user.id, id))) return error("Not in that crew", 403);
  const body = await readJson<{ autoShare?: string; name?: string; publicRadio?: boolean }>(req);
  if (body?.autoShare === "plays" || body?.autoShare === "likes" || body?.autoShare === "off") await setAutoShare(auth.user.id, id, body.autoShare as AutoShare);
  const name = str(body?.name, 60);
  if (name) await renameCrew(id, name);
  let publicCode: string | null | undefined;
  if (typeof body?.publicRadio === "boolean") publicCode = await setPublicRadio(id, body.publicRadio);
  return json({ me: await buildMe(auth.user), publicCode });
}
