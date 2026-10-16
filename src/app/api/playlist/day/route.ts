import { json, error, requireUser } from "@/lib/api";
import { isMember } from "@/lib/queries";
import { sendsOnDay, dayTitle, localDate, dayLabel } from "@/lib/days";
import { now } from "@/lib/db";

/** GET ?crew=&date=YYYY-MM-DD&tz=: one day of the crew's playlist, newest first. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const u = new URL(req.url);
  const crewId = u.searchParams.get("crew") ?? "";
  const date = u.searchParams.get("date") ?? "";
  const tz = u.searchParams.get("tz") || "UTC";
  if (!crewId || !(await isMember(auth.user.id, crewId))) return error("Not in that crew", 403);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return error("date must be YYYY-MM-DD");
  const sends = await sendsOnDay(auth.user.id, crewId, date, tz);
  return json({ date, title: dayTitle(date), label: dayLabel(date, localDate(now(), tz), tz), sends });
}
