import { json, requireUser } from "@/lib/api";
import { ensureIngestToken, rotateIngestToken } from "@/lib/ingest";
import { appUrl } from "@/lib/session";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return json({ token: await ensureIngestToken(auth.user.id), appUrl: appUrl(), projectDir: process.cwd() });
}

export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return json({ token: await rotateIngestToken(auth.user.id), appUrl: appUrl(), projectDir: process.cwd() });
}
