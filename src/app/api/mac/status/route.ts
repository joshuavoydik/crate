import { json, requireUser } from "@/lib/api";
import { one } from "@/lib/db";

/** When the Mac helper last reported, and what it said: the line under "Crate on your Mac" in Settings. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const r = await one<{ mac_seen_at: number | null; mac_last: string | null; mac_blocked: string | null }>("SELECT mac_seen_at, mac_last, mac_blocked FROM users WHERE id = ?", [auth.user.id]);
  return json({ seenAt: r?.mac_seen_at ?? null, last: r?.mac_last ?? null, blocked: r?.mac_blocked ?? null });
}
