import { json, error, requireUser } from "@/lib/api";
import { isMaker } from "@/lib/maker";
import { pulse } from "@/lib/pulse";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!(await isMaker(auth.user.id))) return error("Not yours", 403);
  return json(await pulse());
}
