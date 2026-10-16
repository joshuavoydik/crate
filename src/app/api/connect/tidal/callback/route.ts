import { finishConnect } from "@/lib/connect";
import { tidalExchange, tidalMe } from "@/lib/sources/tidal";

export async function GET(req: Request) {
  return finishConnect(req, "tidal", async (code, state) => {
    const token = await tidalExchange(code, state.verifier);
    const me = await tidalMe(token).catch(() => ({ label: "TIDAL", country: "US" }));
    return { token: { ...token, country: me.country }, label: me.label };
  });
}
