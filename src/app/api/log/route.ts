import { json, requireUser } from "@/lib/api";
import { logFor, likesThisWeek } from "@/lib/log";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return json({ items: await logFor(auth.user.id), likesThisWeek: await likesThisWeek(auth.user.id) });
}
