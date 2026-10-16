import { json, error, readJson, requireUser, str } from "@/lib/api";
import { run } from "@/lib/db";

/** Test hook, only with CRATE_TEST_HOOKS=1: moves a send into the past, to exercise the days. */
export async function POST(req: Request) {
  if (process.env.CRATE_TEST_HOOKS !== "1") return error("Not found", 404);
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ sendId?: string; createdAt?: number }>(req);
  const id = str(body?.sendId, 40);
  if (!id || typeof body?.createdAt !== "number") return error("sendId and createdAt required");
  await run("UPDATE sends SET created_at = ? WHERE id = ?", [body.createdAt, id]);
  return json({ ok: true });
}
