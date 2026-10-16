import { json, error, readJson, requireUser, str } from "@/lib/api";
import { appleConfigured, appleDeveloperToken } from "@/lib/sources/apple";
import { saveSource, syncUser } from "@/lib/sync";

/** GET: a developer token for MusicKit in the browser. POST: store the Music User Token it returns. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!(await appleConfigured())) return error("Apple Music is not configured on this server (APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY)", 501);
  try {
    return json({ developerToken: await appleDeveloperToken() });
  } catch (e) {
    return error(`Could not sign the Apple developer token: ${(e as Error).message}`, 500);
  }
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ musicUserToken?: string }>(req);
  const token = str(body?.musicUserToken, 4000);
  if (!token) return error("Missing Music User Token");
  await saveSource({ userId: auth.user.id, kind: "apple", label: "Apple Music", token: { musicUserToken: token } });
  const reports = await syncUser(auth.user.id, { force: true, only: "apple" });
  return json({ ok: true, reports });
}
