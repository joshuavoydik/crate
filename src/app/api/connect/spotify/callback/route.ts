import { finishConnect } from "@/lib/connect";
import { spotifyExchange, spotifyMe } from "@/lib/sources/spotify";

export async function GET(req: Request) {
  return finishConnect(req, "spotify", async (code, state) => {
    const token = await spotifyExchange(code, state.verifier);
    const label = await spotifyMe(token).catch(() => "Spotify");
    return { token, label };
  });
}
