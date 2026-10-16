import { startConnect } from "@/lib/connect";
import { tidalAuthUrl, tidalConfigured } from "@/lib/sources/tidal";
import { error } from "@/lib/api";

export async function GET() {
  if (!(await tidalConfigured())) return error("TIDAL is not configured on this server (TIDAL_CLIENT_ID)", 501);
  return startConnect("tidal", (state, challenge) => tidalAuthUrl(state, challenge));
}
