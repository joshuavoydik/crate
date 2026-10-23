import { json, error } from "@/lib/api";
import { sentInTest } from "@/lib/mail";

/** Test hook, only with CRATE_TEST_HOOKS=1: the emails this server would have sent, newest last. */
export async function GET(req: Request) {
  if (process.env.CRATE_TEST_HOOKS !== "1") return error("Not found", 404);
  const to = new URL(req.url).searchParams.get("to");
  return json({ mail: to ? sentInTest.filter((m) => m.to === to) : sentInTest });
}
