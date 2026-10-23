"use client";

import { useState } from "react";
import { useStore } from "./Store";
import { Avatar } from "./Avatar";
import { api, timeAgo } from "@/lib/client";
import type { Comment, Send } from "@/lib/types";

/** A comment posted from a row or the stage, so the full thread on the card (when it is on screen too) picks it up. */
export const THREAD_EVENT = "crate:comment";
export type ThreadEvent = { sendId: string; comment: Comment };

/**
 * The thread on the row itself: the last few comments under the song, and a line to add one, right
 * there. Nothing to open. More than three and the row says so; the card has the whole thread.
 */
export function RowThread({ send, onOpen, compact = false }: { send: Send; onOpen?: () => void; compact?: boolean }) {
  const { me, toast } = useStore();
  const [extra, setExtra] = useState<Comment[]>([]);
  const [count, setCount] = useState(send.commentCount);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const shown = [...send.comments, ...extra.filter((c) => !send.comments.some((s) => s.id === c.id))];
  const more = Math.max(0, count - shown.length);

  async function post() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await api<{ comment: Comment }>(`/api/sends/${encodeURIComponent(send.id)}/comments`, { method: "POST", json: { body } });
      setExtra((x) => [...x, r.comment]);
      setCount((n) => n + 1);
      setText("");
      window.dispatchEvent(new CustomEvent<ThreadEvent>(THREAD_EVENT, { detail: { sendId: send.id, comment: r.comment } }));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const empty = shown.length === 0;
  return (
    <div
      className={`rt${compact ? " rt--compact" : ""}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {shown.length > 0 && (
        <ul className="rt__list">
          {shown.slice(-3).map((c) => (
            <li key={c.id} className="rt__item">
              <Avatar name={c.person.name} url={c.person.avatarUrl} size={18} />
              <span className="rt__who">{c.person.id === me.id ? "You" : c.person.name.split(" ")[0]}</span>
              <span className="rt__text">{c.body}</span>
              <span className="rt__when readout">{timeAgo(c.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && onOpen && (
        <button type="button" className="rt__more" onClick={onOpen}>
          {more === 1 ? "1 more" : `${more} more`}
        </button>
      )}
      <form
        className={`rt__say${open || text ? " is-open" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <input
          className="rt__field"
          placeholder={empty ? "Say something" : "Add to it"}
          value={text}
          aria-label="Comment"
          onFocus={() => setOpen(true)}
          onBlur={() => !text && setOpen(false)}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText("");
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {(open || text) && (
          <button type="submit" className="rt__post" disabled={!text.trim() || busy}>
            {busy ? "…" : "Post"}
          </button>
        )}
      </form>
    </div>
  );
}
