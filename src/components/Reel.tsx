"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { StageCard, type Exit } from "./StageCard";
import { TrackCard } from "./TrackCard";
import { Sheet } from "./Sheet";
import { artFallback } from "./Avatar";
import { IconKeep, IconNext, IconDeck, IconPlay, IconPause } from "./Icons";
import { api, flag, setFlag, timeAgo, openOrder, metaOf } from "@/lib/client";
import { analyzeTrack } from "@/lib/audio/analyze";
import { openable } from "@/lib/resolve/links";
import type { Send, ReactionStatus, Track, LogItem } from "@/lib/types";
import Link from "next/link";

/**
 * How many columns the stage gets: "one" (the card alone, details in a sheet), "two" (the card
 * beside the stage) or "three" (the queue as well). It follows the room the page actually has,
 * the shell's content box, which the friends rail takes 300px out of. The thresholds match the
 * container queries on `.shell` in globals.css, so CSS and React always agree.
 */
type Layout = "one" | "two" | "three";

function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>("one");
  useEffect(() => {
    const shell = document.querySelector("main.shell");
    if (!shell || typeof ResizeObserver === "undefined") {
      const w = window.innerWidth;
      setLayout(w >= 1180 ? "three" : w >= 900 ? "two" : "one");
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setLayout(w >= 1180 ? "three" : w >= 900 ? "two" : "one");
    });
    ro.observe(shell);
    return () => ro.disconnect();
  }, []);
  return layout;
}

export function Reel({ embedded = false, onCaughtUp }: { embedded?: boolean; onCaughtUp?: () => void } = {}) {
  const { me, crew, setAccentTrack, toast, sendsVersion, openSend, openInvite } = useStore();
  const layout = useLayout();
  /** The card has a panel of its own beside the stage; otherwise it opens in a sheet. */
  const desktop = layout !== "one";
  const player = usePlayer();
  const [sends, setSends] = useState<Send[] | null>(null);
  const [index, setIndex] = useState(0);
  const [exit, setExit] = useState<Exit>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [lastSend, setLastSend] = useState<Send | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [lately, setLately] = useState<LogItem[] | null>(null);
  const busy = useRef(false);

  const crewId = crew?.id ?? null;

  const load = useCallback(async () => {
    if (!crewId) return;
    try {
      const r = await api<{ sends: Send[] }>(`/api/sends?crew=${encodeURIComponent(crewId)}&view=reel`);
      setSends((prev) => {
        if (!prev) return r.sends;
        const known = new Set(prev.map((s) => s.id));
        const fresh = r.sends.filter((s) => !known.has(s.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      if (r.sends.length === 0) {
        const all = await api<{ sends: Send[] }>(`/api/sends?crew=${encodeURIComponent(crewId)}&view=all`);
        setLastSend(all.sends.find((s) => s.from.id !== me.id) ?? null);
        const log = await api<{ items: LogItem[] }>("/api/log").catch(() => ({ items: [] as LogItem[] }));
        const seen = new Set<string>();
        setLately(
          log.items
            .filter((i) => {
              if (seen.has(i.track.id)) return false;
              seen.add(i.track.id);
              return true;
            })
            .slice(0, 8),
        );
      }
    } catch (e) {
      toast((e as Error).message);
    }
  }, [crewId, me.id, toast]);

  // Switching crews resets the reel.
  useEffect(() => {
    setSends(null);
    setIndex(0);
    setExit(null);
    setCardOpen(false);
    load();
  }, [crewId, load]);

  useEffect(() => {
    load();
  }, [sendsVersion, load]);

  useEffect(() => {
    const id = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    setShowHint(!flag("hint-seen"));
  }, []);

  const current = sends && index < sends.length ? sends[index] : null;

  // The stage ran dry after showing cards: hand back to the playlist.
  useEffect(() => {
    if (sends && !current && index > 0 && sends.length > 0) onCaughtUp?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, index, sends]);

  // The current card colors the page, autoplays once armed, and gets analyzed.
  useEffect(() => {
    setAccentTrack(current?.track ?? null);
    if (!current) return;
    if (player.armed) player.play(current.track.id, current.track.previewUrl, metaOf(current.track));
    if (current.track.previewUrl && (!current.track.bpm || !current.track.camelot)) {
      setAnalyzing(current.track.id);
      analyzeTrack(current.track).then((t) => {
        setAnalyzing((a) => (a === current.track.id ? null : a));
        if (t) patchTrack(t);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function patchTrack(t: Track) {
    setSends((prev) => (prev ? prev.map((s) => (s.track.id === t.id ? { ...s, track: t } : s)) : prev));
  }

  function patchSend(updated: Send) {
    setSends((prev) => (prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev));
  }

  async function react(send: Send, status: ReactionStatus, reply?: string) {
    try {
      const r = await api<{ send: Send }>(`/api/sends/${send.id}/react`, {
        method: "POST",
        json: reply === undefined ? { status } : { status, reply },
      });
      patchSend(r.send);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  function advance(dir: Exit) {
    if (busy.current || !current) return;
    busy.current = true;
    setExit(dir);
    if (showHint) {
      setFlag("hint-seen");
      setShowHint(false);
    }
    window.setTimeout(() => {
      setExit(null);
      setIndex((i) => i + 1);
      busy.current = false;
    }, 420);
  }

  const next = useCallback(() => {
    if (!current) return;
    const st = current.reaction?.status;
    if (st !== "saved" && st !== "played") react(current, "skipped");
    advance("up");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, showHint]);

  const prev = useCallback(() => {
    if (index === 0 || !sends) return;
    const p = sends[index - 1];
    if (p.reaction?.status === "skipped") react(p, "seen");
    setCardOpen(false);
    setIndex(index - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, sends]);

  const save = useCallback(() => {
    if (!current) return;
    react(current, "saved");
    toast("Kept");
    setCardOpen(false);
    advance("right");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, showHint]);

  const played = useCallback(() => {
    if (!current) return;
    react(current, "played");
    toast("Marked as played out");
    setCardOpen(false);
    advance("right");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, showHint]);

  const openPreferred = useCallback(() => {
    if (!current) return;
    const key = openable(current.track.links, openOrder(me, current)).direct[0];
    const url = key ? current.track.links[key]!.url : current.sourceUrl;
    if (url) window.open(url, "_blank", "noopener");
  }, [current, me]);

  // Keyboard: space play, j/k next/prev, s keep, p played out, o open, enter card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!current || document.documentElement.classList.contains("is-pocket")) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          player.play(current.track.id, current.track.previewUrl, metaOf(current.track));
          break;
        case "j":
        case "ArrowDown":
          e.preventDefault();
          next();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          prev();
          break;
        case "s":
          save();
          break;
        case "p":
          if (me.isDj) played();
          break;
        case "o":
          openPreferred();
          break;
        case "Enter":
        case "i":
          setCardOpen(true);
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, next, prev, save, played, openPreferred, player, me.isDj]);

  if (!crew) {
    return (
      <div className="empty">
        <h2 className="display empty__title">No crew yet.</h2>
        <p className="muted">Start one from the top left and share the invite link with the people you trade music with.</p>
      </div>
    );
  }

  if (sends === null) {
    return (
      <div className="stage" aria-busy>
        <div className="stagecard">
          <div className="cover skeleton" />
          <div className="skeleton" style={{ width: 180, height: 12, marginTop: 28 }} />
          <div className="skeleton" style={{ width: 260, height: 40, marginTop: 14 }} />
        </div>
      </div>
    );
  }

  const others = crew.members.filter((m) => m.id !== me.id);
  const remaining = sends.length - index;

  const reelClass = `reel${embedded ? " reel--embedded" : ""}`;

  if (!current) {
    return (
      <div className={reelClass}>
        <div className="empty">
          <h2 className="display empty__title">Nothing new.</h2>
          <p className="muted">
            {lastSend
              ? `Last from ${lastSend.from.name.split(" ")[0]}, ${timeAgo(lastSend.createdAt)}.`
              : others.length
                ? `When ${others.map((m) => m.name.split(" ")[0]).join(" or ")} sends something, it lands here.`
                : "Invite someone to this crew and the music starts flowing both ways."}
          </p>
          <div className="stage__actions">
            {!others.length && (
              <button className="btn btn--primary" onClick={openInvite}>
                Invite someone
              </button>
            )}
            <button className="btn" onClick={() => openSend()}>
              Send something
            </button>
            {index > 0 && (
              <button className="btn btn--ghost" onClick={prev}>
                Back one
              </button>
            )}
          </div>
          {lately && lately.length > 0 && (
            <div className="lately">
              <div className="caps">Lately, from your history</div>
              <div className="strip">
                {lately.map((i) => (
                  <Link key={i.id} className="strip__item" href="/history" title={`${i.track.artist} · ${i.track.title}`} style={{ textAlign: "left" }}>
                    <div className="log__artwrap">
                      {i.track.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="strip__art" src={i.track.artworkUrl} alt="" onError={artFallback} />
                      ) : (
                        <div className="strip__art" />
                      )}
                      {player.canPlay(i.track) && (
                        <button
                          className="log__play"
                          aria-label="Preview"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            player.play(i.track.id, i.track.previewUrl, metaOf(i.track));
                          }}
                        >
                          {player.currentId === i.track.id && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                        </button>
                      )}
                    </div>
                    <div className="tile__title" style={{ fontSize: 12 }}>
                      {i.track.title}
                    </div>
                    <div className="tile__artist">{i.track.artist}</div>
                  </Link>
                ))}
              </div>
              <Link href="/history" className="caps" style={{ display: "inline-block", marginTop: 6 }}>
                Open your history
              </Link>
            </div>
          )}
          {lately && lately.length === 0 && me.sources.length === 0 && (
            <p className="faint" style={{ fontSize: 13, marginTop: 28 }}>
              Connect Spotify in{" "}
              <Link href="/settings" style={{ textDecoration: "underline" }}>
                Settings
              </Link>
              , or run Crate on your Mac or in Chrome, and what you play lands here on its own.
            </p>
          )}
        </div>
      </div>
    );
  }

  const upcoming = sends.slice(index);

  return (
    <div className={reelClass}>
      {layout !== "three" && (
        <div className="reel__meta caps">
          <span className="num">{remaining} left</span>
          {index > 0 && (
            <button className="caps" style={{ pointerEvents: "auto" }} onClick={prev}>
              Back
            </button>
          )}
        </div>
      )}
      <div className="reel__layout">
        {layout === "three" && (
          <aside className="queue" aria-label="Up next">
            <div className="queue__head">
              <span className="caps num">Up next · {remaining} left</span>
              {index > 0 && (
                <button className="caps" onClick={prev}>
                  Back
                </button>
              )}
            </div>
            <ul className="queue__list">
              {upcoming.slice(0, 12).map((s, i) => (
                <li key={s.id}>
                  <button
                    className={`queue__item${i === 0 ? " is-current" : ""}`}
                    onClick={() => {
                      if (i === 0) return;
                      setIndex(index + i);
                    }}
                  >
                    {s.track.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="queue__art" src={s.track.artworkUrl} alt="" onError={artFallback} />
                    ) : (
                      <div className="queue__art" />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div className="queue__title">{s.track.title}</div>
                      <div className="queue__artist">
                        {s.track.artist} · {s.from.name.split(" ")[0]}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <section className="stage" aria-label="Now playing">
          <StageCard key={current.id} send={current} exit={exit} onSave={save} onOpen={() => setCardOpen(true)} showMeta={me.isDj} />
          <div className="stage__actions">
            <button className="btn btn--sm btn--ghost" onClick={next} title="Next (J)">
              <IconNext size={14} /> Next
            </button>
            <button className="btn btn--sm" onClick={save} title="Keep (S)">
              <IconKeep size={14} /> Keep
            </button>
            {me.isDj && (
              <button className="btn btn--sm btn--accent" onClick={played} title="Played out (P)">
                <IconDeck size={14} /> Played out
              </button>
            )}
          </div>
          {desktop
            ? showHint && (
                <div className="hint caps">
                  <span className="kbd">space</span> play <span className="kbd">J</span> next <span className="kbd">K</span> back <span className="kbd">S</span>{" "}
                  keep{" "}
                  {me.isDj && (
                    <>
                      <span className="kbd">P</span> played out{" "}
                    </>
                  )}
                  <span className="kbd">O</span> open <span className="kbd">⌘K</span> send
                </div>
              )
            : showHint && <div className="hint caps">Swipe right to keep · hold for details</div>}
        </section>

        <aside className="panel" aria-label="Track details">
          {desktop && (
            <TrackCard
              send={current}
              analyzing={analyzing === current.track.id}
              onSave={save}
              onPlayed={played}
              onTrackChange={patchTrack}
              onReply={(text) => react(current, current.reaction?.status ?? "seen", text).then(() => toast("Sent back"))}
            />
          )}
        </aside>
      </div>

      <Sheet open={cardOpen && !desktop} onClose={() => setCardOpen(false)} label="Track details">
        <TrackCard
          send={current}
          analyzing={analyzing === current.track.id}
          onSave={save}
          onPlayed={played}
          onTrackChange={patchTrack}
          onReply={(text) => react(current, current.reaction?.status ?? "seen", text).then(() => toast("Sent back"))}
        />
      </Sheet>
    </div>
  );
}
