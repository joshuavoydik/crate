import { json, requireUser } from "@/lib/api";
import { ensureIngestToken, rotateIngestToken } from "@/lib/ingest";
import { appUrl } from "@/lib/session";

/** Where the source lives, when this Crate runs from a checkout on the person's own machine; nothing on a host. */
function projectDir(): string | undefined {
  return process.env.VERCEL || process.env.FLY_APP_NAME || process.env.CRATE_HOSTED ? undefined : process.cwd();
}

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return json({ token: await ensureIngestToken(auth.user.id), appUrl: appUrl(), projectDir: projectDir() });
}

export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return json({ token: await rotateIngestToken(auth.user.id), appUrl: appUrl(), projectDir: projectDir() });
}
