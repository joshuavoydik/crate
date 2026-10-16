import { json, error, readJson, str } from "@/lib/api";
import { userByIngestToken, ingestLink } from "@/lib/ingest";
import { extractUrl } from "@/lib/resolve/parse";

/**
 * POST /api/ingest with "Authorization: Bearer crate_..." from the iMessage helper (or anything
 * else that wants to drop a link in): { url?, text?, from?, fromName?, at? }.
 */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const user = await userByIngestToken(token);
  if (!user) return error("Bad ingest token", 401);
  const body = await readJson<{ url?: string; text?: string; from?: string; fromName?: string; at?: number }>(req);
  if (!body) return error("Bad JSON");
  const url = extractUrl(str(body.url, 2000), str(body.text, 4000));
  if (!url) return json({ outcome: { kind: "ignored", reason: "no link" } });
  const outcome = await ingestLink({
    userId: user.id,
    url,
    fromHandle: str(body.from, 120),
    fromName: str(body.fromName, 120),
    text: str(body.text, 1000)?.replace(url, "").trim() || null,
    at: typeof body.at === "number" && body.at > 0 ? body.at : null,
  });
  return json({ outcome });
}
