import { noticesFor } from "./notices";
import { isMaker } from "./maker";
import { currentUser } from "./auth";
import { crewsFor, avatarUrlFor } from "./queries";
import { sourcesFor } from "./sync";
import { configured } from "./sources";
import { googleSignInConfigured } from "./google-signin";
import { mailConfigured } from "./mail";
import { one, all } from "./db";
import type { Me } from "./types";

export async function buildMe(user: { id: string; name: string; isDj: boolean; preferredPlatform: string; lastfmUser: string | null }): Promise<Me> {
  const extra = await one<{ imessage_handle: string | null; avatar_v: number; has_avatar: number; email: string | null; google_sub: string | null }>(
    "SELECT imessage_handle, avatar_v, (avatar IS NOT NULL) AS has_avatar, email, google_sub FROM users WHERE id = ?",
    [user.id],
  );
  const sources = (await sourcesFor(user.id)).map((s) => ({ kind: s.kind, label: s.label, status: s.status, error: s.error, lastSyncAt: s.last_sync_at }));
  return {
    ...user,
    avatarUrl: avatarUrlFor(user.id, extra?.avatar_v ?? 0, !!extra?.has_avatar),
    imessageHandle: extra?.imessage_handle ?? null,
    crews: await crewsFor(user.id),
    sources,
    listensOn: await listensOn(
      user.id,
      sources.map((s) => s.kind),
    ),
    connectors: await configured(),
    notices: await noticesFor(user.id),
    isMaker: await isMaker(user.id),
    email: extra?.email ?? null,
    hasGoogle: !!extra?.google_sub,
    signIn: { google: await googleSignInConfigured(), email: await mailConfigured() },
  };
}

/**
 * Where someone really listens: the platforms Crate has seen them play on (newest first), then any
 * account they connected. Last.fm is a ledger, not a place to open a song, so it is left out.
 */
async function listensOn(userId: string, connected: string[]): Promise<string[]> {
  const rows = await all<{ source: string }>(
    "SELECT source FROM live_history WHERE user_id = ? AND source != 'none' GROUP BY source ORDER BY MAX(started_at) DESC LIMIT 4",
    [userId],
  );
  const out: string[] = [];
  for (const s of [...rows.map((r) => r.source), ...connected]) {
    if (s && s !== "lastfm" && !out.includes(s)) out.push(s);
  }
  return out;
}

export async function loadMe(): Promise<Me | null> {
  const user = await currentUser();
  if (!user) return null;
  return buildMe(user);
}

export { appUrl } from "./app-url";
