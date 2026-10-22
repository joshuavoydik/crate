import { all, one, run, now, id } from "./db";
import { avatarUrlFor } from "./queries";
import { ping, first } from "./push";
import type { Comment } from "./types";

/**
 * Comments: a thread under a song, for the whole crew. The sender hears about every one; so does
 * anyone who already said something there.
 */

type Row = { id: string; send_id: string; user_id: string; name: string; is_dj: number; avatar_v: number; has_avatar: number; body: string; created_at: number };

function fromRow(r: Row): Comment {
  return {
    id: r.id,
    sendId: r.send_id,
    person: { id: r.user_id, name: r.name, isDj: !!r.is_dj, avatarUrl: avatarUrlFor(r.user_id, r.avatar_v ?? 0, !!r.has_avatar) },
    body: r.body,
    at: r.created_at,
  };
}

export async function commentsOn(sendId: string): Promise<Comment[]> {
  const rows = await all<Row>(
    `SELECT c.id, c.send_id, c.user_id, u.name, u.is_dj, u.avatar_v, (u.avatar IS NOT NULL) AS has_avatar, c.body, c.created_at
     FROM comments c JOIN users u ON u.id = c.user_id WHERE c.send_id = ? ORDER BY c.created_at ASC LIMIT 200`,
    [sendId],
  );
  return rows.map(fromRow);
}

export async function addComment(sendId: string, userId: string, body: string): Promise<Comment> {
  const cid = id("cm");
  await run("INSERT INTO comments (id, send_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)", [cid, sendId, userId, body, now()]);
  const row = await one<Row>(
    `SELECT c.id, c.send_id, c.user_id, u.name, u.is_dj, u.avatar_v, (u.avatar IS NOT NULL) AS has_avatar, c.body, c.created_at
     FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    [cid],
  );
  return fromRow(row!);
}

/** Only your own, and it goes for good. */
export async function deleteComment(commentId: string, userId: string): Promise<boolean> {
  const n = await run("DELETE FROM comments WHERE id = ? AND user_id = ?", [commentId, userId]);
  return n > 0;
}

/** "Dana on Tiger Moth": the sender and everyone else in the thread, except whoever just spoke. */
export async function announceComment(send: { id: string; from: { id: string }; track: { title: string } }, by: { id: string; name: string }, body: string): Promise<void> {
  const others = await all<{ user_id: string }>("SELECT DISTINCT user_id FROM comments WHERE send_id = ? AND user_id != ?", [send.id, by.id]);
  const to = new Set(others.map((o) => o.user_id));
  if (send.from.id !== by.id) to.add(send.from.id);
  if (!to.size) return;
  await ping(Array.from(to), { title: `${first(by.name)} on ${send.track.title}`, body: body.slice(0, 140), url: "/history?filter=back", tag: `comment:${send.id}` });
}
