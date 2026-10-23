import { json, requireUser } from "@/lib/api";
import { signSignInLink } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { throttled } from "@/lib/ratelimit";

/** A one-day link that signs this person in on another device. Send it to yourself; it is the key. */
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const slow = throttled(`signin-link:${auth.user.id}`, 20);
  if (slow) return slow;
  const token = await signSignInLink(auth.user.id);
  return json({ url: `${appUrl()}/signin/link?token=${encodeURIComponent(token)}` });
}
