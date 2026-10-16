import { json, error, readJson, requireUser, str } from "@/lib/api";
import { dismissNotice, noticesFor } from "@/lib/notices";

/** POST { id }: hide a notice until the thing behind it is connected again. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ id?: string }>(req);
  const id = str(body?.id, 120);
  if (!id) return error("id required");
  await dismissNotice(auth.user.id, id);
  return json({ notices: await noticesFor(auth.user.id) });
}
