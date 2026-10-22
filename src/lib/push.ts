/**
 * Pings: a web push when someone sends you a song by hand, writes back, or the week's recap is in.
 * The VAPID pair is derived from SESSION_SECRET, so there is nothing new to configure; rotating the
 * secret retires every subscription, and people turn pings back on once.
 */
import webpush from "web-push";
import { createECDH, createHmac } from "node:crypto";
import { all, run, now, one } from "./db";
import { encrypt, decrypt } from "./crypto";
import { sessionSecret } from "./secret";
import { appUrl } from "./app-url";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

export type Ping = {
  title: string;
  body?: string;
  /** Where a tap lands, relative to the app. */
  url: string;
  /** Pings with the same tag replace each other on the device. */
  tag?: string;
};

let cached: { publicKey: string; privateKey: string } | null = null;

/** One P-256 pair, the same on every server that shares the secret. */
export function vapidKeys(): { publicKey: string; privateKey: string } {
  if (cached) return cached;
  const ecdh = createECDH("prime256v1");
  let seed = createHmac("sha256", sessionSecret()).update("crate:vapid:v1").digest();
  for (;;) {
    try {
      ecdh.setPrivateKey(seed);
      break;
    } catch {
      // Not a valid scalar (vanishingly rare): hash again.
      seed = createHmac("sha256", sessionSecret()).update(seed).digest();
    }
  }
  cached = { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: seed.toString("base64url") };
  return cached;
}

function configure(): void {
  const k = vapidKeys();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || appUrl(), k.publicKey, k.privateKey);
}

export async function saveSubscription(userId: string, sub: Sub, ua: string | null): Promise<void> {
  await run(
    `INSERT INTO push_subs (endpoint, user_id, sub_enc, ua, created_at, fails) VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, sub_enc = excluded.sub_enc, ua = excluded.ua, fails = 0`,
    [sub.endpoint, userId, encrypt(JSON.stringify(sub)), ua, now()],
  );
}

export async function dropSubscription(userId: string, endpoint: string): Promise<void> {
  await run("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?", [endpoint, userId]);
}

export async function hasSubscription(userId: string, endpoint: string): Promise<boolean> {
  return !!(await one("SELECT 1 AS x FROM push_subs WHERE endpoint = ? AND user_id = ?", [endpoint, userId]));
}

export async function subscriptionCount(userId: string): Promise<number> {
  const r = await one<{ n: number }>("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?", [userId]);
  return Number(r?.n ?? 0);
}

/** Sends one ping to every device these people turned pings on for. Dead endpoints are dropped. */
export async function ping(userIds: string[], p: Ping): Promise<number> {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (!ids.length) return 0;
  const rows = await all<{ endpoint: string; user_id: string; sub_enc: string }>(
    `SELECT endpoint, user_id, sub_enc FROM push_subs WHERE user_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  if (!rows.length) return 0;
  configure();
  const payload = JSON.stringify({ title: p.title, body: p.body ?? "", url: p.url, tag: p.tag ?? "crate" });
  let sent = 0;
  await Promise.all(
    rows.map(async (r) => {
      let sub: Sub;
      try {
        sub = JSON.parse(decrypt(r.sub_enc)) as Sub;
      } catch {
        await run("DELETE FROM push_subs WHERE endpoint = ?", [r.endpoint]);
        return;
      }
      try {
        await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12, urgency: "normal" });
        sent++;
        await run("UPDATE push_subs SET last_ok_at = ?, fails = 0 WHERE endpoint = ?", [now(), r.endpoint]);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode ?? 0;
        if (code === 404 || code === 410) await run("DELETE FROM push_subs WHERE endpoint = ?", [r.endpoint]);
        else await run("UPDATE push_subs SET fails = fails + 1 WHERE endpoint = ?", [r.endpoint]);
      }
    }),
  );
  return sent;
}

/** First names, the way the rest of Crate says them. */
export function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Theo sent you a song": every other member of the crew, with the note as the body. */
export async function announceSend(send: { id: string; crewId: string; from: { id: string; name: string }; note: string | null; track: { title: string; artist: string } }): Promise<void> {
  const members = await all<{ user_id: string }>("SELECT user_id FROM crew_members WHERE crew_id = ? AND user_id != ?", [send.crewId, send.from.id]);
  if (!members.length) return;
  const line = `${send.track.title} · ${send.track.artist}`;
  await ping(
    members.map((m) => m.user_id),
    {
      title: `${first(send.from.name)} sent you a song`,
      body: send.note ? `${line}\n“${send.note}”` : line,
      url: "/",
      tag: `send:${send.id}`,
    },
  );
}

/** "Dana kept Tiger Moth" or "Dana: ok that bridge": back to whoever sent it. */
export async function announceBack(send: { id: string; from: { id: string }; track: { title: string } }, by: { id: string; name: string }, status: string, reply: string | null | undefined): Promise<void> {
  if (by.id === send.from.id) return;
  const who = first(by.name);
  let title: string | null = null;
  if (reply) title = `${who}: ${reply}`;
  else if (status === "saved") title = `${who} kept ${send.track.title}`;
  else if (status === "played") title = `${who} played ${send.track.title} out`;
  if (!title) return;
  await ping([send.from.id], { title, body: reply ? send.track.title : "", url: "/history?filter=back", tag: `back:${send.id}:${by.id}` });
}
