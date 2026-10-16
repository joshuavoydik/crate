import { json, error, readJson, requireUser, str } from "@/lib/api";
import { saveSource } from "@/lib/sync";
import { run } from "@/lib/db";
import type { SourceKind } from "@/lib/sources";

/** Test hook, only with CRATE_TEST_HOOKS=1: puts a source row in a given state without OAuth. */
export async function POST(req: Request) {
  if (process.env.CRATE_TEST_HOOKS !== "1") return error("Not found", 404);
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ kind?: string; status?: string; error?: string | null }>(req);
  const kind = str(body?.kind, 20) as SourceKind;
  if (!kind) return error("kind required");
  await saveSource({ userId: auth.user.id, kind, label: `test ${kind}`, token: { access_token: "x", expires_at: Date.now() + 3600_000 } });
  await run("UPDATE sources SET status = ?, error = ?, last_sync_at = ? WHERE user_id = ? AND kind = ?", [
    body?.status ?? "ok",
    body?.error ?? null,
    Date.now(),
    auth.user.id,
    kind,
  ]);
  return json({ ok: true });
}
