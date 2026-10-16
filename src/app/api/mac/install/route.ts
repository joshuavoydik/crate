import { userByIngestToken } from "@/lib/ingest";
import { installScript, uninstallScript } from "@/lib/mac";
import { appUrl } from "@/lib/session";

/**
 * GET /api/mac/install?key=crate_...            the installer, for `curl ... | bash`
 * GET /api/mac/install?key=crate_...&remove=1   the uninstaller
 * The key is the person's ingest token, so the script it serves carries their own token.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "";
  const user = await userByIngestToken(key);
  if (!user) return new Response("echo 'That link is not valid any more. Open Crate, Settings, Crate on your Mac, and copy a fresh one.'\n", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  const body = u.searchParams.get("remove") ? uninstallScript() : installScript({ url: appUrl(), token: key });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
