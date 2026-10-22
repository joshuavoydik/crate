"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStoreMaybe } from "./Store";
import { api } from "@/lib/client";

/**
 * One player for the whole app. Whole songs come through the person's own Spotify: inside the page
 * where the Web Playback SDK runs (desktop browsers, Android), or on the Spotify app they have open
 * where it does not (iPhone). Everything else, and every fallback, is the 30-second preview in one
 * <audio> element. Browsers need a user gesture before audio can start, so the first play "arms"
 * the player; after that cards autoplay.
 */

/** Whether whole songs can play, and how. */
export type NowMeta = { title: string; artist: string; art: string | null };

export type Full =
  | "off" // no Spotify connected
  | "loading"
  | "ready" // the SDK is up: whole songs play right here
  | "app" // this browser cannot run the SDK: whole songs play on the Spotify app that is open
  | "reconnect" // the Spotify connection predates the streaming permission
  | "premium"; // Spotify only streams here for Premium accounts

type PlayerState = {
  currentId: string | null;
  playing: boolean;
  progress: number;
  /** Position and length of the current whole song, when one is playing here. */
  position: number;
  duration: number;
  armed: boolean;
  full: Full;
  /** "spotify" while a whole song plays in the page; "preview" for the 30 seconds. */
  mode: "preview" | "spotify" | null;
  now: NowMeta | null;
  /** True when this track can play at all: a whole song through Spotify, or a preview. */
  canPlay: (t: { previewUrl: string | null }) => boolean;
  /** Play a track; the same id toggles pause. The url is its preview, the fallback; the meta is for the strip. */
  play: (id: string, url: string | null, meta?: NowMeta | null) => void;
  pause: () => void;
  toggle: () => void;
  /** Jump to a point in the current song, 0 to 1. */
  seek: (fraction: number) => void;
  arm: () => void;
};

const Ctx = createContext<PlayerState | null>(null);

export function usePlayer(): PlayerState {
  const p = useContext(Ctx);
  if (!p) throw new Error("usePlayer outside PlayerProvider");
  return p;
}

type SdkPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (x: unknown) => void) => void;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  activateElement?: () => Promise<void>;
};
type SdkState = {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: { uri: string; name: string; artists: Array<{ name: string }>; album: { images: Array<{ url: string }> } } };
};
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }) => SdkPlayer };
  }
}

function loadSdk(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    if (document.querySelector("script[data-spotify-sdk]")) return;
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    s.dataset.spotifySdk = "1";
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

/** iOS cannot run the SDK (no Widevine in Safari); everything else gets to try. */
function sdkPossible(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return !ios && typeof window.MediaSource !== "undefined";
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const store = useStoreMaybe();
  const toast = useCallback((m: string) => store?.toast(m), [store]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [armed, setArmed] = useState(false);
  const [full, setFull] = useState<Full>("off");
  const [mode, setMode] = useState<"preview" | "spotify" | null>(null);
  const [now, setNow] = useState<NowMeta | null>(null);
  const current = useRef<{ id: string; url: string | null; mode: "preview" | "spotify" } | null>(null);
  const sdk = useRef<SdkPlayer | null>(null);
  const device = useRef<string | null>(null);
  const fullRef = useRef<Full>("off");
  const lastPos = useRef(0);
  /** Where the whole song was at the last word from Spotify, so the strip can keep moving between words. */
  const anchor = useRef({ pos: 0, at: 0 });
  const spotifyConnected = !!store?.me.sources.some((s) => s.kind === "spotify" && s.status !== "off");

  useEffect(() => {
    fullRef.current = full;
  }, [full]);

  // The preview element.
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audio.current = a;
    const onTime = () => {
      if (current.current?.mode !== "preview") return;
      if (a.duration && isFinite(a.duration)) {
        setProgress(a.currentTime / a.duration);
        setPosition(a.currentTime * 1000);
        setDuration(a.duration * 1000);
      }
    };
    const onEnd = () => {
      if (current.current?.mode !== "preview") return;
      setPlaying(false);
      setProgress(1);
    };
    const onPlay = () => current.current?.mode === "preview" && setPlaying(true);
    const onPause = () => current.current?.mode === "preview" && setPlaying(false);
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

  // Whole songs: once, when Spotify is connected.
  useEffect(() => {
    if (!spotifyConnected) {
      setFull("off");
      return;
    }
    let stop = false;
    setFull("loading");
    (async () => {
      const t = await api<{ ok: boolean; reason?: string; token?: string }>("/api/spotify/token").catch(() => ({ ok: false, reason: "none" }));
      if (stop) return;
      if (!t.ok) {
        setFull(t.reason === "scope" ? "reconnect" : "off");
        return;
      }
      if (!sdkPossible()) {
        setFull("app");
        return;
      }
      await loadSdk();
      if (stop || !window.Spotify) {
        setFull("app");
        return;
      }
      const p = new window.Spotify.Player({
        name: "Crate",
        volume: 1,
        getOAuthToken: (cb) => {
          api<{ ok: boolean; token?: string }>("/api/spotify/token")
            .then((r) => r.ok && r.token && cb(r.token))
            .catch(() => undefined);
        },
      });
      p.addListener("ready", (x) => {
        device.current = (x as { device_id: string }).device_id;
        setFull("ready");
      });
      p.addListener("not_ready", () => {
        device.current = null;
        setFull((f) => (f === "ready" ? "app" : f));
      });
      p.addListener("initialization_error", () => setFull("app"));
      p.addListener("authentication_error", () => setFull("reconnect"));
      p.addListener("account_error", () => setFull("premium"));
      p.addListener("player_state_changed", (x) => {
        const s = x as SdkState | null;
        if (!s || current.current?.mode !== "spotify") return;
        // The end of a song arrives as "paused at 0" right after it was near the end.
        const ended = s.paused && s.position === 0 && s.duration > 0 && lastPos.current >= s.duration - 3000;
        lastPos.current = s.position;
        anchor.current = { pos: ended ? s.duration : s.position, at: Date.now() };
        setPlaying(!s.paused);
        setPosition(ended ? s.duration : s.position);
        setDuration(s.duration);
        setProgress(ended ? 1 : s.duration ? s.position / s.duration : 0);
        const t = s.track_window?.current_track;
        if (t) setNow({ title: t.name, artist: t.artists.map((a) => a.name).join(", "), art: t.album?.images?.[0]?.url ?? null });
      });
      sdk.current = p;
      p.connect().catch(() => setFull("app"));
    })();
    return () => {
      stop = true;
      sdk.current?.disconnect();
      sdk.current = null;
      device.current = null;
    };
  }, [spotifyConnected]);

  // Between words from Spotify a whole song keeps moving.
  useEffect(() => {
    if (mode !== "spotify" || !playing || !duration) return;
    const t = setInterval(() => {
      const pos = Math.min(duration, anchor.current.pos + (Date.now() - anchor.current.at));
      setPosition(pos);
      setProgress(pos / duration);
    }, 500);
    return () => clearInterval(t);
  }, [mode, playing, duration]);

  const arm = useCallback(() => setArmed(true), []);

  const playPreview = useCallback((id: string, url: string | null, meta?: NowMeta | null) => {
    const a = audio.current;
    if (!a) return;
    current.current = { id, url, mode: "preview" };
    setMode("preview");
    setCurrentId(id);
    setProgress(0);
    setPosition(0);
    setDuration(0);
    setNow(meta ?? null);
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

  const playWhole = useCallback(
    async (id: string, url: string | null, how: "ready" | "app", meta?: NowMeta | null) => {
      const a = audio.current;
      a?.pause();
      current.current = { id, url, mode: "spotify" };
      lastPos.current = 0;
      setMode("spotify");
      setCurrentId(id);
      setProgress(0);
      setPosition(0);
      setDuration(0);
      if (meta) setNow(meta);
      setArmed(true);
      if (how === "ready") {
        setPlaying(true);
        await sdk.current?.activateElement?.().catch(() => undefined);
      }
      try {
        const r = await api<{ device: string | null }>("/api/spotify/play", { method: "POST", json: { trackId: id, deviceId: how === "ready" ? device.current : null } });
        if (how === "app") {
          setPlaying(false);
          toast(`Playing on ${r.device ?? "your Spotify"}`);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (url) {
          playPreview(id, url, meta);
          toast(/premium/i.test(msg) ? "Whole songs need Spotify Premium; here is the preview." : /open spotify/i.test(msg) ? "Open Spotify first for the whole song. Here is the preview." : "Spotify could not play it; here is the preview.");
          if (/premium/i.test(msg)) setFull("premium");
        } else {
          setPlaying(false);
          toast(msg);
        }
      }
    },
    [playPreview, toast],
  );

  // A preview here is browsing, not listening: it is never reported to the crew as what you have on.
  // Live follows the platforms (Spotify, Last.fm, the Mac helper, Crate in Chrome), not this player.

  const play = useCallback(
    (id: string, url: string | null, meta?: NowMeta | null) => {
      const cur = current.current;
      const a = audio.current;
      if (cur?.id === id) {
        if (cur.mode === "spotify" && fullRef.current === "ready") {
          sdk.current?.togglePlay().catch(() => undefined);
          return;
        }
        if (cur.mode === "preview" && a && cur.url === url) {
          if (a.paused) a.play().catch(() => setPlaying(false));
          else a.pause();
          return;
        }
      }
      if (fullRef.current === "ready" || fullRef.current === "app") {
        void playWhole(id, url, fullRef.current, meta);
        return;
      }
      playPreview(id, url, meta);
    },
    [playPreview, playWhole],
  );

  const seek = useCallback((fraction: number) => {
    const f = Math.min(1, Math.max(0, fraction));
    const cur = current.current;
    if (!cur) return;
    if (cur.mode === "spotify") {
      if (!duration) return;
      const ms = Math.round(f * duration);
      lastPos.current = ms;
      anchor.current = { pos: ms, at: Date.now() };
      setPosition(ms);
      setProgress(f);
      sdk.current?.seek(ms).catch(() => undefined);
      return;
    }
    const a = audio.current;
    if (!a || !a.duration || !isFinite(a.duration)) return;
    a.currentTime = f * a.duration;
    setProgress(f);
    setPosition(a.currentTime * 1000);
  }, [duration]);

  const pause = useCallback(() => {
    if (current.current?.mode === "spotify") sdk.current?.pause().catch(() => undefined);
    else audio.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const cur = current.current;
    if (!cur) return;
    if (cur.mode === "spotify") {
      sdk.current?.togglePlay().catch(() => undefined);
      return;
    }
    const a = audio.current;
    if (!a || !cur.url) return;
    if (a.paused) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, []);

  const canPlay = useCallback((t: { previewUrl: string | null }) => full === "ready" || full === "app" || !!t.previewUrl, [full]);

  const value = useMemo<PlayerState>(
    () => ({ currentId, playing, progress, position, duration, armed, full, mode, now, canPlay, play, pause, toggle, seek, arm }),
    [currentId, playing, progress, position, duration, armed, full, mode, now, canPlay, play, pause, toggle, seek, arm],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
