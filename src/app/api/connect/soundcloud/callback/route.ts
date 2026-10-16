import { finishConnect } from "@/lib/connect";
import { soundcloudExchange, soundcloudMe } from "@/lib/sources/soundcloud";

export async function GET(req: Request) {
  return finishConnect(req, "soundcloud", async (code, state) => {
    const token = await soundcloudExchange(code, state.verifier);
    const label = await soundcloudMe(token).catch(() => "SoundCloud");
    return { token, label };
  });
}
