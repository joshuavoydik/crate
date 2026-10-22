import { json, error, requireUser } from "@/lib/api";
import { isMaker } from "@/lib/maker";
import { problems } from "@/lib/problems";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!(await isMaker(auth.user.id))) return error("Not yours", 403);
  return json(await problems());
}
