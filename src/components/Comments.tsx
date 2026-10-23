"use client";

import { useEffect, useState } from "react";
import { useStore } from "./Store";
import { Avatar } from "./Avatar";
import { api, timeAgo } from "@/lib/client";
import type { Comment } from "@/lib/types";
import { THREAD_EVENT, type ThreadEvent } from "./RowThread";

/** The thread under a song: everyone in the crew reads it, anyone can add to it, you can take back your own. */
export function Comments({ sendId, initialCount = 0, onCount }: { sendId: string; initialCount?: number; onCount?: (n: number) => void }) {
  const { me, toast } = useStore();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    setList(null);
    api<{ comments: Comment[] }>(`/api/sends/${encodeURIComponent(sendId)}/comments`)
      .then((r) => !stop && setList(r.comments))
      .catch(() => !stop && setList([]));
    return () => {
      stop = true;
    };
  }, [sendId]);

  // A comment posted on the row or the stage lands here too, without a refetch.
  useEffect(() => {
    function onPosted(e: Event) {
      const { sendId: id, comment } = (e as CustomEvent<ThreadEvent>).detail;
      if (id !== sendId) return;
      setList((l) => (l && !l.some((c) => c.id === comment.id) ? [...l, comment] : l));
    }
    window.addEventListener(THREAD_EVENT, onPosted);
    return () => window.removeEventListener(THREAD_EVENT, onPosted);
  }, [sendId]);

  async function post() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await api<{ comments: Comment[] }>(`/api/sends/${encodeURIComponent(sendId)}/comments`, { method: "POST", json: { body } });
      setList(r.comments);
      onCount?.(r.comments.length);
      setText("");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Comment) {
    try {
      await api(`/api/comments/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      const next = (list ?? []).filter((x) => x.id !== c.id);
      setList(next);
      onCount?.(next.length);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const n = list ? list.length : initialCount;
  return (
    <section className="thread" aria-label="Comments">
      <div className="caps thread__head">{n === 0 ? "Say something" : n === 1 ? "1 comment" : `${n} comments`}</div>
      {list && list.length > 0 && (
        <ul className="thread__list">
          {list.map((c) => (
            <li key={c.id} className="thread__item">
              <Avatar name={c.person.name} url={c.person.avatarUrl} size={24} />
              <div className="thread__body">
                <div className="thread__who">
                  <span>{c.person.id === me.id ? "You" : c.person.name.split(" ")[0]}</span>
                  <span className="thread__when readout">{timeAgo(c.at)}</span>
                  {c.person.id === me.id && (
                    <button type="button" className="thread__x" onClick={() => remove(c)} aria-label="Delete your comment">
                      ×
                    </button>
                  )}
                </div>
                <div className="thread__text">{c.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="replybox"
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <input
          className="field"
          placeholder={n === 0 ? "First to say something about this one" : "Add to the thread"}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          aria-label="Comment"
        />
        <button className="btn btn--sm" type="submit" disabled={!text.trim() || busy}>
          {busy ? "…" : "Post"}
        </button>
      </form>
    </section>
  );
}
