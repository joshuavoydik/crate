import { requireUser } from "@/lib/api";
import { ensureIngestToken } from "@/lib/ingest";
import { terminalFile } from "@/lib/mac";
import { appUrl } from "@/lib/session";

/** A Terminal settings file that runs the install line when opened: the one-double-click setup. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const remove = !!new URL(req.url).searchParams.get("remove");
  const body = terminalFile({ url: appUrl(), token: await ensureIngestToken(auth.user.id), remove });
  return new Response(body, {
    headers: {
      "content-type": "application/x-apple-terminal-settings; charset=utf-8",
      "content-disposition": `attachment; filename="${remove ? "Remove Crate from this Mac" : "Crate on your Mac"}.terminal"`,
      "cache-control": "no-store",
    },
  });
}
