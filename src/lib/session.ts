import { noticesFor } from "./notices";
import { currentUser } from "./auth";
import { crewsFor, avatarUrlFor } from "./queries";
import { sourcesFor } from "./sync";
import { configured } from "./sources";
import { one } from "./db";
import type { Me } from "./types";

export async function buildMe(user: { id: string; name: string; isDj: boolean; preferredPlatform: string; lastfmUser: string | null }): Promise<Me> {
  const extra = await one<{ imessage_handle: string | null; avatar_v: number; has_avatar: number }>(
    "SELECT imessage_handle, avatar_v, (avatar IS NOT NULL) AS has_avatar FROM users WHERE id = ?",
    [user.id],
  );
  const sources = (await sourcesFor(user.id)).map((s) => ({ kind: s.kind, label: s.label, status: s.status, error: s.error, lastSyncAt: s.last_sync_at }));
  return {
    ...user,
    avatarUrl: avatarUrlFor(user.id, extra?.avatar_v ?? 0, !!extra?.has_avatar),
    imessageHandle: extra?.imessage_handle ?? null,
    crews: await crewsFor(user.id),
    sources,
    connectors: await configured(),
    notices: await noticesFor(user.id),
  };
}

export async function loadMe(): Promise<Me | null> {
  const user = await currentUser();
  if (!user) return null;
  return buildMe(user);
}

export { appUrl } from "./app-url";
