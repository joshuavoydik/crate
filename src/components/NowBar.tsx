"use client";

import { usePlayer } from "./Player";
import { IconPlay, IconPause } from "./Icons";
import { artFallback } from "./Avatar";

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A whole song playing here: one strip with the song, where it is, and pause. Nothing while a preview plays. */
export function NowBar() {
  const player = usePlayer();
  if (player.mode !== "spotify" || !player.currentId || !player.now) return null;
  const { now } = player;
  const cells = 24;
  const lit = Math.round(player.progress * cells);
  return (
    <div className="nowbar" role="region" aria-label="Now playing">
      {now.art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="nowbar__art" src={now.art} alt="" onError={artFallback} />
      ) : (
        <span className="nowbar__art" />
      )}
      <div className="nowbar__text">
        <div className="nowbar__title">{now.title}</div>
        <div className="nowbar__sub">{now.artist}</div>
        <div className="nowbar__meter" aria-hidden>
          {Array.from({ length: cells }, (_, i) => (
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
