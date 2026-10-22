"use client";

import { useRef } from "react";
import { usePlayer } from "./Player";
import { IconPlay, IconPause } from "./Icons";
import { artFallback } from "./Avatar";

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const CELLS = 24;

/**
 * The one player strip, for a whole song and for a preview alike: the song, a segmented meter you can
 * scrub, where it is, and pause. A preview says so, since 30 seconds is not the song.
 */
export function NowBar() {
  const player = usePlayer();
  const meter = useRef<HTMLDivElement | null>(null);
  if (!player.currentId || !player.now || !player.mode) return null;
  const { now } = player;
  const lit = Math.round(player.progress * CELLS);
  const preview = player.mode === "preview";

  function at(e: React.PointerEvent<HTMLDivElement>): number {
    const el = meter.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return r.width ? (e.clientX - r.left) / r.width : 0;
  }

  return (
    <div className={`nowbar${preview ? " is-preview" : ""}`} role="region" aria-label="Now playing">
      {now.art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="nowbar__art" src={now.art} alt="" onError={artFallback} />
      ) : (
        <span className="nowbar__art" />
      )}
      <div className="nowbar__text">
        <div className="nowbar__title">{now.title}</div>
        <div className="nowbar__sub">
          {now.artist}
          {preview && <span className="nowbar__tag">Preview</span>}
        </div>
        <div
          ref={meter}
          className="nowbar__meter"
          role="slider"
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(player.progress * 100)}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            player.seek(at(e));
          }}
          onPointerMove={(e) => {
            if (e.buttons & 1) player.seek(at(e));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") player.seek(player.progress + 0.05);
            if (e.key === "ArrowLeft") player.seek(player.progress - 0.05);
          }}
        >
          {Array.from({ length: CELLS }, (_, i) => (
            <i key={i} className={i < lit ? "is-lit" : ""} />
          ))}
        </div>
      </div>
      <span className="nowbar__time readout">
        {clock(player.position)}
        <span className="faint"> / {clock(player.duration)}</span>
      </span>
      <button className="nowbar__btn" onClick={() => player.toggle()} aria-label={player.playing ? "Pause" : "Play"}>
        {player.playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
    </div>
  );
}
