import { run } from "./db";
import { decrypt, encrypt } from "./crypto";
import { sourcesFor } from "./sync";
import { tracksIn } from "./collections";
import { spotifyCreatePlaylist, spotifyTrackUri, SpotifyScopeError } from "./sources/spotify";
import { appleCreatePlaylist } from "./sources/apple";
import type { Collection } from "./types";

/**
 * A Crate playlist saved to where this person listens: a private playlist on their Spotify, or
 * one in their Apple Music library, with the same tracks in the same order. Tracks the platform
 * does not have are left out and counted.
 */

export type ExportTarget = "spotify" | "apple";

export class ExportError extends Error {
  code: "not_connected" | "reconnect" | "nothing";
  constructor(message: string, code: ExportError["code"]) {
    super(message);
    this.code = code;
  }
}

export async function exportCollection(userId: string, collection: Collection, crewName: string, to: ExportTarget): Promise<{ url: string | null; added: number; missed: number }> {
  const source = (await sourcesFor(userId)).find((s) => s.kind === to && s.token_enc);
  if (!source) throw new ExportError(to === "spotify" ? "Connect Spotify first (Settings)" : "Connect Apple Music first (Settings)", "not_connected");
  let token: Record<string, unknown>;
  try {
    token = JSON.parse(decrypt(source.token_enc!)) as Record<string, unknown>;
  } catch {
    throw new ExportError("Reconnect once; the saved sign-in could not be read", "reconnect");
  }
  const tracks = await tracksIn(collection);
  if (!tracks.length) throw new ExportError("Nothing in this playlist yet", "nothing");
  const description = `${collection.name}, from ${crewName} on Crate`;

  if (to === "apple") {
    const ids = tracks.map((t) => t.track.appleId).filter((x): x is string => !!x);
    if (!ids.length) throw new ExportError("None of these are in the Apple Music catalog", "nothing");
    try {
      const made = await appleCreatePlaylist(String(token.musicUserToken ?? ""), collection.name, description, ids);
      return { url: made.id ? `https://music.apple.com/library/playlist/${made.id}` : null, added: ids.length, missed: tracks.length - ids.length };
    } catch (e) {
      if (/reconnect/i.test((e as Error).message)) throw new ExportError((e as Error).message, "reconnect");
      throw e;
    }
  }

  // Spotify: a direct link gives the URI straight away; anything else is found by searching.
  let tok = token;
  const uris: string[] = [];
  for (const t of tracks) {
    try {
      const r = await spotifyTrackUri(tok, t.track.artist, t.track.title, t.track.links.spotify?.url ?? null);
      if (r.token) tok = r.token;
      if (r.uri) uris.push(r.uri);
    } catch (e) {
      // A refused sign-in is not a track that could not be found: say so, once, with the way back in.
      if (e instanceof SpotifyScopeError || /^40[13] from/.test((e as Error).message)) throw new ExportError("Reconnect Spotify once so Crate may save playlists there", "reconnect");
      /* one that could not be looked up is one missed */
    }
  }
  if (!uris.length) throw new ExportError("None of these could be found on Spotify", "nothing");
  try {
    const made = await spotifyCreatePlaylist(tok, collection.name, description, uris);
    if (made.token) tok = made.token;
    if (tok !== token) await run("UPDATE sources SET token_enc = ? WHERE id = ?", [encrypt(JSON.stringify(tok)), source.id]);
    return { url: made.url, added: uris.length, missed: tracks.length - uris.length };
  } catch (e) {
    if (e instanceof SpotifyScopeError) throw new ExportError(e.message, "reconnect");
    throw e;
  }
}
