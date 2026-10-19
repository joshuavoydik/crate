import { json, requireUser } from "@/lib/api";
import { one } from "@/lib/db";

/** When Crate in Chrome last reported, and what it said: the line on the Crate in Chrome page. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const r = await one<{ chrome_seen_at: number | null; chrome_last: string | null }>("SELECT chrome_seen_at, chrome_last FROM users WHERE id = ?", [auth.user.id]);
  let last: { source?: string; title?: string; artist?: string } | null = null;
  try {
    last = r?.chrome_last ? (JSON.parse(r.chrome_last) as typeof last) : null;
  } catch {
    last = null;
  }
  return json({ seenAt: r?.chrome_seen_at ?? null, last });
}
