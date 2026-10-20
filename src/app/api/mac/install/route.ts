import { userByIngestToken } from "@/lib/ingest";
import { installScript, uninstallScript } from "@/lib/mac";
import { appUrl } from "@/lib/session";

/**
 * GET /api/mac/install            the installer, for `curl -H "authorization: Bearer crate_..." ... | bash`
 * GET /api/mac/install?remove=1   the uninstaller
 * The key is the person's ingest token, so the script it serves carries their own token. It travels
 * in a header, so it stays out of access logs and shell history; ?key= still works for old links.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || u.searchParams.get("key") || "";
  const user = await userByIngestToken(key);
  if (!user) return new Response("echo 'That link is not valid any more. Open Crate, Settings, Crate on your Mac, and copy a fresh one.'\n", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  const body = u.searchParams.get("remove") ? uninstallScript() : installScript({ url: appUrl(), token: key });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
