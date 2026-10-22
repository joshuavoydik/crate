import { json, requireUser } from "@/lib/api";
import { run } from "@/lib/db";

/** A visit: one row per person per day, counted up. */
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const day = new Date().toISOString().slice(0, 10);
  await run("INSERT INTO visits (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET n = n + 1", [auth.user.id, day]);
  return json({ ok: true });
}
