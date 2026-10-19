"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * One <audio> element for the whole app. Browsers need a user gesture before audio
 * can start, so the first play "arms" the player; after that cards autoplay.
 */
type PlayerState = {
  currentId: string | null;
  playing: boolean;
  progress: number;
  armed: boolean;
  /** Play a preview for a track id; same id toggles pause. */
  play: (id: string, url: string | null) => void;
  pause: () => void;
  toggle: () => void;
  arm: () => void;
};

const Ctx = createContext<PlayerState | null>(null);

export function usePlayer(): PlayerState {
  const p = useContext(Ctx);
  if (!p) throw new Error("usePlayer outside PlayerProvider");
  return p;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [armed, setArmed] = useState(false);
  const current = useRef<{ id: string; url: string | null } | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audio.current = a;
    const onTime = () => {
      if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(1);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      audio.current = null;
    };
  }, []);

  const arm = useCallback(() => setArmed(true), []);

  // A preview here is browsing, not listening: it is never reported to the crew as what you have on.
  // Live follows the platforms (Spotify, Last.fm, the Mac helper, Crate in Chrome), not this player.

  const play = useCallback((id: string, url: string | null) => {
    const a = audio.current;
    if (!a) return;
    if (current.current?.id === id && current.current.url === url) {
      if (a.paused) a.play().catch(() => setPlaying(false));
      else a.pause();
      return;
    }
    current.current = { id, url };
    setCurrentId(id);
    setProgress(0);
    if (!url) {
      a.pause();
      a.removeAttribute("src");
      setPlaying(false);
      return;
    }
    a.src = url;
    a.currentTime = 0;
    a.play()
      .then(() => setArmed(true))
      .catch(() => setPlaying(false));
  }, []);

  const pause = useCallback(() => {
    audio.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a || !current.current?.url) return;
    if (a.paused) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, []);

  const value = useMemo<PlayerState>(
    () => ({ currentId, playing, progress, armed, play, pause, toggle, arm }),
    [currentId, playing, progress, armed, play, pause, toggle, arm],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
