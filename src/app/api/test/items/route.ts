import { json, error, readJson, requireUser } from "@/lib/api";
import { ingestItems } from "@/lib/sync";
import type { SourceItem } from "@/lib/sources";

/**
 * Test hook, only with CRATE_TEST_HOOKS=1: feeds items into the caller's log exactly as a
 * connected source would, so the crew rules can be exercised without OAuth.
 */
export async function POST(req: Request) {
  if (process.env.CRATE_TEST_HOOKS !== "1") return error("Not found", 404);
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ kind?: string; items?: SourceItem[] }>(req);
  if (!body?.kind || !Array.isArray(body.items)) return error("kind and items required");
  const result = await ingestItems(auth.user.id, body.kind, body.items);
  return json(result);
}
