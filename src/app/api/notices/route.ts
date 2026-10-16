import { json, requireUser } from "@/lib/api";
import { noticesFor } from "@/lib/notices";

/** The things that need the caller's hand right now. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return json({ notices: await noticesFor(auth.user.id) });
}
