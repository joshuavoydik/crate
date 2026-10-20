export const maxDuration = 60;

import { json, error, readJson, requireUser, str } from "@/lib/api";
import { resolveUrl, resolveAppleId } from "@/lib/resolve";
import { extractUrl } from "@/lib/resolve/parse";
import { upsertTrack } from "@/lib/queries";
import { suggestNote } from "@/lib/agent";
import { throttled } from "@/lib/ratelimit";
import { publicHttpUrl } from "@/lib/safe-url";

/**
 * Turns a link (or a catalog pick) into a stored Track plus a suggested note.
 * The send itself is created separately, so the UI can show the card while the person decides.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const slow = throttled(`resolve:${auth.user.id}`, 40);
  if (slow) return slow;
  const body = await readJson<{ url?: string; appleId?: string; recipientIsDj?: boolean }>(req);
  if (!body) return error("Bad JSON");

  let resolved = null;
  if (body.appleId) {
    resolved = await resolveAppleId(String(body.appleId));
    if (!resolved) return error("That track could not be found", 404);
  } else {
    const url = extractUrl(str(body.url, 2000));
    if (!url) return error("Paste a link to a track");
    if (!(await publicHttpUrl(url))) return error("That link points somewhere Crate cannot reach. Paste a link from Spotify, YouTube, SoundCloud, Apple Music or a public web page.");
    resolved = await resolveUrl(url);
  }
  const track = await upsertTrack(resolved);
  const note = await suggestNote({
    artist: track.artist,
    title: track.title,
    album: track.album,
    genre: track.genre,
    year: track.year,
    bpm: track.bpm,
    keyName: track.keyName,
    senderName: auth.user.name,
    recipientIsDj: !!body.recipientIsDj,
    sourcePlatform: resolved.sourcePlatform,
  });
  return json({ track, resolved: resolved.resolved, sourceUrl: resolved.sourceUrl, suggestedNote: note });
}
