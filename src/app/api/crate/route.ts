import { json, requireUser } from "@/lib/api";
import { crateFor } from "@/lib/queries";
import { keptReceived } from "@/lib/log";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const sends = [...(await crateFor(auth.user.id)), ...(await keptReceived(auth.user.id))].sort(
    (a, b) => (b.reaction?.updatedAt ?? b.createdAt) - (a.reaction?.updatedAt ?? a.createdAt),
  );
  return json({ sends });
}
