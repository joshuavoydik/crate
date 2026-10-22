import { json, requireUser } from "@/lib/api";
import { streamToken } from "@/lib/stream";

/** The signed-in person's Spotify access token, for the player in the page. Theirs alone; short-lived. */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return json(await streamToken(auth.user.id));
}
