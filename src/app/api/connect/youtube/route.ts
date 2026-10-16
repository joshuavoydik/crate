import { startConnect } from "@/lib/connect";
import { youtubeAuthUrl, youtubeConfigured } from "@/lib/sources/youtube";
import { error } from "@/lib/api";

export async function GET() {
  if (!(await youtubeConfigured())) return error("YouTube is not configured on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)", 501);
  return startConnect("youtube", (state) => youtubeAuthUrl(state));
}
