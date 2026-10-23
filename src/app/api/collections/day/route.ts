import { json, error, readJson, requireUser, str } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { shareDay } from "@/lib/collections";
import { dayTitle } from "@/lib/days";
import { appUrl } from "@/lib/app-url";

/** POST { crew, date, tz, name? }: a day of the log as a shared playlist, link on. Idempotent per day. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ crew?: string; date?: string; tz?: string; name?: string }>(req);
  const crewId = str(body?.crew, 40);
  const date = str(body?.date, 10);
  const tz = str(body?.tz, 64) || "UTC";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error("date must be YYYY-MM-DD");
  const name = str(body?.name, 60) || dayTitle(date);
  const { collection, code } = await shareDay(crewId, auth.user.id, date, tz, name);
  return json({ collection, url: `${appUrl()}/p/${code}` });
}
