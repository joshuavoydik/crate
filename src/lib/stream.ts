/**
 * Whole songs in Crate: the signed-in person's own Spotify, played either inside the page (the Web
 * Playback SDK, on browsers that can) or on the Spotify app they have open (Connect). Both need their
 * token; the SDK also needs the streaming scope and Premium.
 */
import { one, run } from "./db";
import { decrypt, encrypt } from "./crypto";
import { spotifyEnsure, spotifyHasScope, spotifyPlay, spotifyTrackUri, SpotifyPlayError } from "./sources/spotify";
import { getTrack } from "./queries";
import type { SourceRow } from "./sync";

type Token = Record<string, unknown>;

async function spotifySource(userId: string): Promise<{ row: SourceRow; token: Token } | null> {
  const row = await one<SourceRow>("SELECT * FROM sources WHERE user_id = ? AND kind = 'spotify' AND token_enc IS NOT NULL AND status != 'off'", [userId]);
  if (!row) return null;
  try {
    return { row, token: JSON.parse(decrypt(row.token_enc!)) as Token };
  } catch {
    return null;
  }
}

async function keep(row: SourceRow, token: Token): Promise<void> {
  await run("UPDATE sources SET token_enc = ? WHERE id = ?", [encrypt(JSON.stringify(token)), row.id]);
}

export type StreamToken = { ok: true; token: string; expiresAt: number } | { ok: false; reason: "none" | "scope" | "reauth" };

/** A fresh access token for the SDK in the page, or the one reason there is none. */
export async function streamToken(userId: string): Promise<StreamToken> {
  const src = await spotifySource(userId);
  if (!src) return { ok: false, reason: "none" };
  if (!spotifyHasScope(src.token, "streaming")) return { ok: false, reason: "scope" };
  try {
    const fresh = await spotifyEnsure(src.token);
    if (fresh !== src.token) await keep(src.row, fresh);
    return { ok: true, token: String(fresh.access_token), expiresAt: Number(fresh.expires_at ?? Date.now() + 3600_000) };
  } catch {
    return { ok: false, reason: "reauth" };
  }
}

/** Plays one of Crate's tracks on this person's Spotify: on the page's own device when given, else wherever Spotify is open. */
export async function playTrack(userId: string, trackId: string, deviceId: string | null): Promise<{ device: string | null }> {
  const src = await spotifySource(userId);
  if (!src) throw new SpotifyPlayError("Connect Spotify in Settings to play whole songs.", "other");
  const track = await getTrack(trackId);
  if (!track) throw new SpotifyPlayError("Unknown track.", "not_found");
  let token = src.token;
  const found = await spotifyTrackUri(token, track.artist, track.title, track.links.spotify?.direct ? track.links.spotify.url : null);
  if (found.token) token = found.token;
  if (!found.uri) {
    if (token !== src.token) await keep(src.row, token);
    throw new SpotifyPlayError(`Spotify does not have "${track.title}".`, "not_found");
  }
  try {
    const played = await spotifyPlay(token, found.uri, 0, deviceId);
    if (played.token) token = played.token;
    return { device: played.device };
  } finally {
    if (token !== src.token) await keep(src.row, token);
  }
}
