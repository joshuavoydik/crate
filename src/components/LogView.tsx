"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Sheet } from "./Sheet";
import { Confirm } from "./Confirm";
import { TrackCard } from "./TrackCard";
import { IconPlay, IconPause, IconPlus } from "./Icons";
import { api, sourceName, timeAgo, viaLabel, metaOf } from "@/lib/client";
import type { LogItem, Send, Track } from "@/lib/types";
import { artFallback } from "./Avatar";

type Filter = "all" | "kept" | "liked" | "played" | "received" | "sent" | "back";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "kept", label: "Kept" },
  { key: "liked", label: "Liked" },
  { key: "played", label: "Played" },
  { key: "received", label: "Received" },
  { key: "sent", label: "Sent" },
  { key: "back", label: "Back to you" },
];

function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  const y = new Date(now - 86400000);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function phrase(i: LogItem): string {
  switch (i.action) {
    case "liked":
      return `liked · ${i.detail ?? sourceName(i.source)}`;
    case "played":
      return `played · ${i.detail ?? sourceName(i.source)}`;
    case "received":
      return `received · ${i.detail ?? "iMessage"}`;
    case "sent":
      return i.source === "app" ? `sent · ${i.detail ?? ""}` : `${viaLabel(i.source) ?? "sent"} → ${i.detail ?? ""}`;
    case "kept":
      return `kept · ${i.detail ?? ""}`;
    case "playedOut":
      return `played out · ${i.detail ?? ""}`;
    case "back":
      return i.detail ?? "came back";
  }
}

export function LogView({ initialFilter }: { initialFilter: string }) {
  const { me, toast, setAccentTrack, sendsVersion, openAddTo } = useStore();
  const player = usePlayer();
  const [items, setItems] = useState<LogItem[] | null>(null);
  const [likes, setLikes] = useState<Array<{ source: string; n: number }>>([]);
  const [filter, setFilter] = useState<Filter>((FILTERS.some((f) => f.key === initialFilter) ? initialFilter : "all") as Filter);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ item: LogItem; send: Send } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  function removeCopy(i: LogItem): { title: string; body: string } {
    switch (i.action) {
      case "sent":
        return { title: "Remove this send?", body: "It disappears for everyone in the crew, including anything they kept from it." };
      case "kept":
      case "playedOut":
        return { title: "Remove from kept?", body: "The track stays in the crew; it just leaves your kept list." };
      default:
        return { title: "Remove from your log?", body: "It can come back if the source sends it again." };
    }
  }

  async function removeItem() {
    if (!open) return;
    setRemoving(true);
    try {
      await api(`/api/log/${encodeURIComponent(open.item.id)}`, { method: "DELETE" });
      setConfirming(false);
      setOpen(null);
      toast("Removed");
      load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  function trackChanged(t: Track) {
    setOpen((o) => (o ? { item: { ...o.item, track: t }, send: { ...o.send, track: t } } : o));
    setItems((prev) => (prev ? prev.map((i) => (i.track.id === t.id ? { ...i, track: t } : i)) : prev));
  }

  const load = () =>
    api<{ items: LogItem[]; likesThisWeek: Array<{ source: string; n: number }> }>("/api/log")
      .then((r) => {
        setItems(r.items);
        setLikes(r.likesThisWeek);
      })
      .catch((e) => toast((e as Error).message));

  // Fresh on open, after anything sent from this tab, when the tab comes back, and every half minute
  // while it stays open: plays arrive from the helper and the extension without this page knowing.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendsVersion]);
  useEffect(() => {
    const id = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAccentTrack(open?.item.track ?? null);
  }, [open, setAccentTrack]);

  async function openItem(i: LogItem) {
    if (i.sendId) {
      try {
        const r = await api<{ send: Send }>(`/api/sends/${encodeURIComponent(i.sendId)}`);
        setOpen({ item: i, send: r.send });
        return;
      } catch {
        /* fall through to a plain card */
      }
    }
    setOpen({ item: i, send: sendFor(i) });
  }

  async function react(status: "saved" | "played" | "skipped") {
    if (!open) return;
    try {
      const r = await api<{ send: Send }>(`/api/sends/${encodeURIComponent(open.send.id)}/react`, { method: "POST", json: { status } });
      setOpen({ item: open.item, send: r.send });
      toast(status === "played" ? "Marked as played out" : status === "saved" ? "Kept" : "Removed from kept");
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const list = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "kept" && i.action !== "kept" && i.action !== "playedOut") return false;
      if (filter !== "all" && filter !== "kept" && i.action !== filter) return false;
      if (!needle) return true;
      return `${i.track.artist} ${i.track.title} ${i.track.album ?? ""} ${i.detail ?? ""} ${i.source}`.toLowerCase().includes(needle);
    });
  }, [items, filter, q]);

  const groups = useMemo(() => {
    const out: Array<{ label: string; items: LogItem[] }> = [];
    for (const i of list) {
      const label = dayLabel(i.at);
      const g = out[out.length - 1];
      if (g && g.label === label) g.items.push(i);
      else out.push({ label, items: [i] });
    }
    return out;
  }, [list]);

  const sendFor = (i: LogItem): Send => ({
    id: i.sendId ?? i.id,
    crewId: "",
    track: i.track,
    from: { id: me.id, name: me.name, isDj: me.isDj, avatarUrl: me.avatarUrl },
    note: null,
    noteBy: "human",
    sourceUrl: null,
    createdAt: i.at,
    reaction: null,
    history: [],
    via: i.source,
    echoes: [],
    activeAt: i.at,
    replies: [],
    commentCount: 0,
    comments: [],
  });

  const weekLine = likes.length ? `This week: ${likes.map((l) => `${l.n} ${l.n === 1 ? "like" : "likes"} from ${sourceName(l.source)}`).join(", ")}.` : null;

  return (
    <div className="page log">
      <div className="page__head">
        <h1 className="display page__title">History</h1>
        <span className="caps num">{items ? `${items.length} entries` : ""}</span>
      </div>
      <p className="muted" style={{ marginTop: -10, marginBottom: 14, fontSize: 15 }}>
        Yours alone: everything you played, liked, kept or sent, across every crew. Nobody else sees this page.
      </p>
      {weekLine && (
        <p className="muted" style={{ marginTop: -10, marginBottom: 18, fontSize: 15 }}>
          {weekLine}
        </p>
      )}
      <div className="toolbar">
        <div className="chips" style={{ marginTop: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip${filter === f.key ? " is-on" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="field" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the log" />
      </div>

      {items && items.length === 0 && (
        <div className="empty">
          <h2 className="display empty__title">Nothing logged yet.</h2>
          <p className="muted">
            Your own listening, kept here for you alone. Connect Spotify in Settings, or run Crate on your Mac or in Chrome, and what you play shows up on
            its own. What you keep and send lands here too.
          </p>
          <div className="stage__actions">
            <Link className="btn" href="/settings">
              Where you listen
            </Link>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="log__day">
          <div className="caps log__dayhead">{g.label}</div>
          {g.items.map((i) => {
            const playing = player.currentId === i.track.id && player.playing;
            return (
              <div
                key={i.id}
                className="row log__row"
                role="button"
                tabIndex={0}
                onClick={() => openItem(i)}
                onKeyDown={(e) => e.key === "Enter" && openItem(i)}
              >
                <div className="log__artwrap">
                  {i.track.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="row__art" src={i.track.artworkUrl} alt="" loading="lazy" onError={artFallback} />
                  ) : (
                    <div className="row__art" />
                  )}
                  {player.canPlay(i.track) && (
                    <button
                      className="log__play"
                      aria-label={playing ? "Pause" : "Preview"}
                      onClick={(e) => {
                        e.stopPropagation();
                        player.play(i.track.id, i.track.previewUrl, metaOf(i.track));
                      }}
                    >
                      {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                    </button>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="row__title log__title">{i.track.title}</div>
                  <div className="row__sub">
                    {i.track.artist}
                    {i.track.camelot && (
                      <span className="num" style={{ marginLeft: 8 }}>
                        {i.track.camelot}
                        {i.track.bpm ? ` · ${Math.round(i.track.bpm)}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="caps log__phrase">{phrase(i)}</div>
                </div>
                <div className="faint num log__time">{timeAgo(i.at)}</div>
                <button
                  type="button"
                  className="rowadd"
                  aria-label="Add to a playlist"
                  title="Add to a playlist"
                  onClick={(e) => {
                    e.stopPropagation();
                    openAddTo(i.track);
                  }}
                >
                  <IconPlus size={14} />
                </button>
              </div>
            );
          })}
        </section>
      ))}

      <Sheet open={!!open && !confirming} onClose={() => setOpen(null)} label="Track details">
        {open && (
          <>
            <TrackCard
              send={open.send}
              analyzing={false}
              onSave={open.send.from.id !== me.id ? () => react(open.send.reaction?.status === "saved" ? "skipped" : "saved") : undefined}
              onPlayed={open.send.from.id !== me.id ? () => react(open.send.reaction?.status === "played" ? "saved" : "played") : undefined}
              onTrackChange={trackChanged}
            />
            {open.item.action !== "back" && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <button className="btn btn--sm btn--ghost" onClick={() => setConfirming(true)}>
                {open.item.action === "sent"
                  ? "Remove this send"
                  : open.item.action === "kept" || open.item.action === "playedOut"
                    ? "Remove from kept"
                    : "Remove from log"}
              </button>
            </div>
            )}
          </>
        )}
      </Sheet>
      {open && (
        <Confirm
          open={confirming}
          title={removeCopy(open.item).title}
          body={removeCopy(open.item).body}
          onConfirm={removeItem}
          onClose={() => setConfirming(false)}
          busy={removing}
        />
      )}
    </div>
  );
}
