import { json, error, readJson, requireUser } from "@/lib/api";
import { vapidKeys, saveSubscription, dropSubscription, hasSubscription } from "@/lib/push";

/** The public key, and whether this device's subscription is on file. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  return json({ key: vapidKeys().publicKey, on: endpoint ? await hasSubscription(auth.user.id, endpoint) : false });
}

type Body = { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<Body>(req);
  const s = body?.subscription;
  if (!s || typeof s.endpoint !== "string" || !s.endpoint.startsWith("https://") || s.endpoint.length > 1024) return error("Bad subscription");
  if (!s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string" || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) return error("Bad subscription");
  await saveSubscription(auth.user.id, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, req.headers.get("user-agent")?.slice(0, 200) ?? null);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ endpoint?: string }>(req);
  if (!body || typeof body.endpoint !== "string") return error("Bad request");
  await dropSubscription(auth.user.id, body.endpoint);
  return json({ ok: true });
}
