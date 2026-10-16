import { finishConnect } from "@/lib/connect";
import { youtubeExchange, youtubeMe } from "@/lib/sources/youtube";

export async function GET(req: Request) {
  return finishConnect(req, "youtube", async (code) => {
    const token = await youtubeExchange(code);
    const label = await youtubeMe(token).catch(() => "YouTube");
    return { token, label };
  });
}
