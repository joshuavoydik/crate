import { json, error, readJson, requireUser, str } from "@/lib/api";
import { playTrack } from "@/lib/stream";
import { SpotifyPlayError } from "@/lib/sources/spotify";
import { throttled } from "@/lib/ratelimit";

/** POST { trackId, deviceId? }: play a track on the page's Spotify device, or on the Spotify app that is open. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const slow = throttled(`play:${auth.user.id}`, 120);
  if (slow) return slow;
  const body = await readJson<{ trackId?: string; deviceId?: string | null }>(req);
  const trackId = str(body?.trackId, 80);
  if (!trackId) return error("trackId required");
  const deviceId = str(body?.deviceId, 120);
  try {
    return json(await playTrack(auth.user.id, trackId, deviceId));
  } catch (e) {
    if (e instanceof SpotifyPlayError) return json({ error: e.message, code: e.code }, 409);
    return error((e as Error).message, 409);
  }
}
