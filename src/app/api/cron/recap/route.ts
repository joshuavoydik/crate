export const maxDuration = 60;

import { json, error } from "@/lib/api";
import { sendRecaps } from "@/lib/recap";
import { cronMark } from "@/lib/problems";

/** Monday's cron: every crew gets its week, as a ping to whoever turned them on. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return error("CRON_SECRET is not set", 501);
  const given = new URL(req.url).searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (given !== secret) return error("Forbidden", 403);
  const pings = await sendRecaps();
  await cronMark("recap");
  return json({ pings });
}
