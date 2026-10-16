import { json, error } from "@/lib/api";
import { syncAll } from "@/lib/sync";

/** For a scheduler (Vercel Cron, launchd, anything): GET /api/cron/sync with CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return error("CRON_SECRET is not set", 501);
  const given = new URL(req.url).searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (given !== secret) return error("Forbidden", 403);
  return json({ users: await syncAll() });
}
