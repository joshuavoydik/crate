export const maxDuration = 60;

import { json, readJson, requireUser } from "@/lib/api";
import { syncUser } from "@/lib/sync";

/** Runs the caller's sources that are due. The app calls this on open and every few minutes. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ force?: boolean }>(req);
  const reports = await syncUser(auth.user.id, { force: !!body?.force });
  return json({ reports });
}
