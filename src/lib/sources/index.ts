import type { Provider, SourceKind } from "./types";
import { spotify } from "./spotify";
import { youtube } from "./youtube";
import { apple } from "./apple";
import { soundcloud } from "./soundcloud";
import { tidal } from "./tidal";
import { lastfm } from "./lastfm";
import { getKeys } from "../keys";

export const PROVIDERS: Record<SourceKind, Provider> = { spotify, youtube, apple, soundcloud, tidal, lastfm };

/** Which connectors have the keys they need right now (environment or saved in Settings). */
export async function configured(): Promise<Record<SourceKind, boolean>> {
  const k = await getKeys();
  return {
    spotify: !!k.SPOTIFY_CLIENT_ID,
    youtube: !!k.GOOGLE_CLIENT_ID && !!k.GOOGLE_CLIENT_SECRET,
    apple: !!k.APPLE_TEAM_ID && !!k.APPLE_KEY_ID && !!k.APPLE_PRIVATE_KEY,
    soundcloud: !!k.SOUNDCLOUD_CLIENT_ID && !!k.SOUNDCLOUD_CLIENT_SECRET,
    tidal: !!k.TIDAL_CLIENT_ID,
    lastfm: !!k.LASTFM_API_KEY,
  };
}

export type { SourceKind, SourceItem, Provider } from "./types";
export { SOURCE_LABELS } from "./types";
