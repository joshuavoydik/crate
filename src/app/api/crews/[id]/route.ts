import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember, setAutoShare, setInviteCode, CodeTakenError } from "@/lib/queries";
import type { AutoShare } from "@/lib/types";
import { buildMe } from "@/lib/session";
import { renameCrew, setPublicRadio } from "@/lib/playlist";
import { normalizeInviteCode, INVITE_CODE_MIN, INVITE_CODE_MAX } from "@/lib/invite";

/**
 * PATCH { autoShare } (the caller's own rule), { name } (the crew's name), { publicRadio } (on or off),
 * { inviteCode } (a custom slug for the invite link; any member may set it).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await isMember(auth.user.id, id))) return error("Not in that crew", 403);
  const body = await readJson<{ autoShare?: string; name?: string; publicRadio?: boolean; inviteCode?: string }>(req);
  if (body?.autoShare === "plays" || body?.autoShare === "likes" || body?.autoShare === "off") await setAutoShare(auth.user.id, id, body.autoShare as AutoShare);
  const name = str(body?.name, 60);
  if (name) await renameCrew(id, name);
  if (body?.inviteCode !== undefined) {
    const code = normalizeInviteCode(String(body.inviteCode ?? ""));
    if (!code) return error(`A link is ${INVITE_CODE_MIN} to ${INVITE_CODE_MAX} letters, numbers or dashes`);
    try {
      await setInviteCode(id, code);
    } catch (e) {
      if (e instanceof CodeTakenError) return error(e.message, 409);
      throw e;
    }
  }
  let publicCode: string | null | undefined;
  if (typeof body?.publicRadio === "boolean") publicCode = await setPublicRadio(id, body.publicRadio);
  return json({ me: await buildMe(auth.user), publicCode });
}
