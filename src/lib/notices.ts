import { all, one, run, now } from "./db";
import { sourcesFor } from "./sync";
import { SOURCE_LABELS, type SourceKind } from "./sources";
import type { Notice } from "./types";

/**
 * Notices: the few things that need a person's hand, shown under the bell top right until they
 * are fixed or dismissed. They are derived from state (a source that asks to be reconnected,
 * a sync that keeps failing), never stored, so a fix clears them on its own; a dismissal is
 * remembered per notice id and forgotten the moment that source is connected again.
 */

type SourceLike = { kind: string; status: string; error: string | null; last_sync_at: number | null };

/** Errors that fix themselves on the next sync; not worth a notice. */
const TRANSIENT = /abort|timeout|timed out|fetch failed|ECONN|ENOTFOUND|network|50\d from|429 from/i;

function tinyHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Pure: which notices this set of sources produces, minus the dismissed ones. */
export function deriveNotices(sources: SourceLike[], dismissed: Set<string>): Notice[] {
  const out: Notice[] = [];
  for (const s of sources) {
    const label = SOURCE_LABELS[s.kind as SourceKind] ?? s.kind;
    const oauth = s.kind === "spotify" || s.kind === "youtube" || s.kind === "soundcloud" || s.kind === "tidal";
    if (s.status === "reauth") {
      out.push({
        id: `reconnect:${s.kind}`,
        kind: "reconnect",
        title: `${label} needs a quick reconnect`,
        body: s.error ?? `Reconnect once and ${label} shows what you play again.`,
        action: oauth ? { label: `Reconnect ${label}`, href: `/api/connect/${s.kind}` } : { label: "Open settings", href: "/settings" },
        at: s.last_sync_at,
      });
    } else if (s.status === "error" && s.error && !TRANSIENT.test(s.error)) {
      out.push({
        id: `error:${s.kind}:${tinyHash(s.error)}`,
        kind: "error",
        title: `${label} stopped syncing`,
        body: s.error,
        action: oauth ? { label: `Reconnect ${label}`, href: `/api/connect/${s.kind}` } : { label: "Open settings", href: "/settings" },
        at: s.last_sync_at,
      });
    }
  }
  return out.filter((n) => !dismissed.has(n.id));
}

/** The Mac helper could not ask an app: macOS has not allowed it yet. */
export function macNotice(app: string | null): Notice | null {
  if (!app) return null;
  const accessibility = app === "SoundCloud";
  return {
    id: `mac:${app}`,
    kind: "reconnect",
    title: `Crate on your Mac cannot see ${app}`,
    body: accessibility
      ? `Reading the SoundCloud app's window needs Accessibility: System Settings → Privacy & Security → Accessibility → turn on osascript.`
      : `Allow it once: System Settings → Privacy & Security → Automation → osascript → ${app}.`,
    action: { label: "Open Privacy settings", href: accessibility ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility" : "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation" },
    at: null,
  };
}

const BACK_WINDOW = 14 * 24 * 3600 * 1000;

/** Someone kept, played out or wrote back on one of this person's sends: the bell says so until it is seen. */
export async function backNotices(userId: string, dismissed: Set<string>): Promise<Notice[]> {
  const rows = await all<{ send_id: string; user_id: string; who: string; status: string; reply: string | null; updated_at: number; title: string; artist: string }>(
    `SELECT s.id AS send_id, r.user_id, u.name AS who, r.status, r.reply, r.updated_at, t.title, t.artist
     FROM reactions r JOIN sends s ON s.id = r.send_id JOIN users u ON u.id = r.user_id JOIN tracks t ON t.id = s.track_id
     WHERE s.from_user_id = ? AND r.user_id != ? AND r.updated_at >= ? AND (r.status IN ('saved', 'played') OR (r.reply IS NOT NULL AND r.reply != ''))
     ORDER BY r.updated_at DESC LIMIT 20`,
    [userId, userId, now() - BACK_WINDOW],
  );
  return rows
    .map((r) => {
      const first = r.who.split(" ")[0];
      const did = r.reply ? "wrote back on" : r.status === "played" ? "played out" : "kept";
      return {
        id: `back:${r.send_id}:${r.user_id}:${r.updated_at}`,
        kind: "back" as const,
        title: `${first} ${did} ${r.title}`,
        body: r.reply ? `“${r.reply}”` : `${r.title} · ${r.artist}`,
        action: { label: "Open your history", href: "/history?filter=back" },
        at: r.updated_at,
      };
    })
    .filter((n) => !dismissed.has(n.id));
}

export async function noticesFor(userId: string): Promise<Notice[]> {
  const sources = await sourcesFor(userId);
  const rows = await all<{ notice_id: string }>("SELECT notice_id FROM notice_dismissals WHERE user_id = ?", [userId]);
  const dismissed = new Set(rows.map((r) => r.notice_id));
  const u = await one<{ mac_blocked: string | null }>("SELECT mac_blocked FROM users WHERE id = ?", [userId]);
  const mac = macNotice(u?.mac_blocked ?? null);
  return [...deriveNotices(sources, dismissed), ...(mac && !dismissed.has(mac.id) ? [mac] : []), ...(await backNotices(userId, dismissed))];
}

export async function dismissNotice(userId: string, id: string): Promise<void> {
  await run("INSERT OR REPLACE INTO notice_dismissals (user_id, notice_id, dismissed_at) VALUES (?, ?, ?)", [userId, id, now()]);
}

