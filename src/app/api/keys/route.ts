import { json, error, readJson, requireUser } from "@/lib/api";
import { isMaker } from "@/lib/maker";
import { keyPresence, setKeys, KEY_NAMES, type KeyName } from "@/lib/keys";
import { configured } from "@/lib/sources";
import { spotifyRedirectUri, youtubeRedirectUri, soundcloudRedirectUri, tidalRedirectUri } from "@/lib/sources/oauth";

/** Which connector keys are set (never their values), plus the redirect URIs to register. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!(await isMaker(auth.user.id))) return error("Only the maker of this Crate can see its keys", 403);
  return json({
    present: await keyPresence(),
    connectors: await configured(),
    redirectUris: { spotify: await spotifyRedirectUri(), youtube: youtubeRedirectUri(), soundcloud: soundcloudRedirectUri(), tidal: tidalRedirectUri() },
  });
}

/** Save keys pasted on the setup page. The maker only: these decide which app every member connects through. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  if (!(await isMaker(auth.user.id))) return error("Only the maker of this Crate can change its keys", 403);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return error("Bad JSON");
  const values: Partial<Record<KeyName, string | null>> = {};
  for (const n of KEY_NAMES) {
    if (n in body) {
      const v = body[n];
      values[n] = v === null ? null : typeof v === "string" ? v.slice(0, 8000) : null;
    }
  }
  if (!Object.keys(values).length) return error("Nothing to save");
  await setKeys(values);
  return json({ present: await keyPresence(), connectors: await configured() });
}
