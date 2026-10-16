import { startConnect } from "@/lib/connect";
import { spotifyAuthUrl, spotifyConfigured } from "@/lib/sources/spotify";
import { error } from "@/lib/api";

export async function GET() {
  if (!(await spotifyConfigured())) return error("Spotify is not configured on this server (SPOTIFY_CLIENT_ID)", 501);
  return startConnect("spotify", (state, challenge) => spotifyAuthUrl(state, challenge));
}
