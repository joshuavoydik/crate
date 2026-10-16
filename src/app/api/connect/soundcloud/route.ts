import { startConnect } from "@/lib/connect";
import { soundcloudAuthUrl, soundcloudConfigured } from "@/lib/sources/soundcloud";
import { error } from "@/lib/api";

export async function GET() {
  if (!(await soundcloudConfigured())) return error("SoundCloud is not configured on this server (SOUNDCLOUD_CLIENT_ID / SECRET)", 501);
  return startConnect("soundcloud", (state, challenge) => soundcloudAuthUrl(state, challenge));
}
