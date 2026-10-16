"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "./Player";
import { IconPlay } from "./Icons";
import { timeAgo, viaLabel } from "@/lib/client";
import type { Send } from "@/lib/types";

export type Exit = "up" | "right" | "down" | null;

/**
 * The card on the stage: cover, title, note, preview progress, and the swipe gestures.
 * Up: next. Right: keep. Down or long-press: open the full card. Tap: play/pause.
 */
export function StageCard({
  send,
  exit,
  onNext,
  onSave,
  onOpen,
  showMeta,
}: {
  send: Send;
  exit: Exit;
  onNext: () => void;
  onSave: () => void;
  onOpen: () => void;
  showMeta: boolean;
}) {
  const player = usePlayer();
  const t = send.track;
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const longPress = useRef<number | null>(null);
  const [settling, setSettling] = useState(false);

  const isCurrent = player.currentId === t.id;
  const playing = isCurrent && player.playing;
  const progress = isCurrent ? player.progress : 0;

  useEffect(() => {
    setDrag(null);
    setSettling(false);
  }, [send.id]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSettling(false);
    longPress.current = window.setTimeout(() => {
      longPress.current = null;
      if (start.current) {
        start.current = null;
        setDrag(null);
        onOpen();
      }
    }, 520);
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) > 6 && longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
    setDrag({ dx, dy });
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dist = Math.hypot(dx, dy);
    const quick = Date.now() - s.t < 350;
    setDrag(null);
    if (dist < 8) {
      player.play(t.id, t.previewUrl);
      return;
    }
    if (dy < -90 || (quick && dy < -40 && Math.abs(dx) < 60)) return onNext();
    if (dx > 100 || (quick && dx > 50 && Math.abs(dy) < 60)) return onSave();
    if (dy > 90 || (quick && dy > 45 && Math.abs(dx) < 60)) return onOpen();
    setSettling(true);
  }

  let transform = "";
  let opacity = 1;
  if (exit === "up") {
    transform = "translateY(-60vh) scale(0.92)";
    opacity = 0;
  } else if (exit === "right") {
    transform = "translateX(60vw) rotate(8deg) scale(0.94)";
    opacity = 0;
  } else if (exit === "down") {
    transform = "translateY(18px)";
  } else if (drag) {
    transform = `translate(${drag.dx * 0.85}px, ${drag.dy * 0.85}px) rotate(${drag.dx * 0.025}deg)`;
  }
  const saveCue = drag ? Math.max(0, Math.min(1, (drag.dx - 30) / 70)) : 0;
  const nextCue = drag ? Math.max(0, Math.min(1, (-drag.dy - 30) / 70)) : 0;

  return (
    <>
      <div className="swipecue swipecue--save" style={{ opacity: saveCue }}>
        Keep
      </div>
      <div className="swipecue swipecue--next" style={{ opacity: nextCue }}>
        Next
      </div>
      <div
        ref={ref}
        className={`stagecard${settling || exit ? " is-animating" : ""}`}
        style={{ transform, opacity }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
          setSettling(true);
        }}
        onTransitionEnd={() => setSettling(false)}
      >
        <div className={`cover${t.artworkUrl ? "" : " cover--empty"}`} style={{ ["--accent" as string]: t.accent ?? undefined }}>
          {t.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.artworkUrl} alt={`${t.title} artwork`} draggable={false} />
          ) : (
            <span className="caps">No artwork</span>
          )}
          {t.previewUrl && (
            <div className={`cover__play${!playing && (!player.armed || !isCurrent) ? " is-visible" : ""}`}>
              <IconPlay size={44} />
            </div>
          )}
          {t.previewUrl && (
            <div className="cover__progress" aria-hidden>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>

        <div className="caps stagecard__from">
          {send.from.name}
          {viaLabel(send.via) ? ` · ${viaLabel(send.via)}` : ""} · {timeAgo(send.createdAt)}
        </div>
        <h2 className="display stagecard__title">{t.title}</h2>
        <div className="stagecard__artist">{t.artist}</div>
        {send.note && (
          <div className="stagecard__note">
            {send.noteBy === "agent" && <span className="dot" />}
            <span>{send.note}</span>
          </div>
        )}
        {showMeta && (t.bpm || t.camelot) && (
          <div className="stagecard__meta caps">
            {t.bpm && <span>{Math.round(t.bpm)} BPM</span>}
            {t.camelot && <span>{t.camelot}</span>}
            {t.energy && <span>Energy {t.energy}</span>}
          </div>
        )}
      </div>
    </>
  );
}
