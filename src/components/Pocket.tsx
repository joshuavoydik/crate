"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { api, timeAgo } from "@/lib/client";
import { getThemeMode, setThemeMode, type ThemeMode } from "@/lib/theme";
import type { Send, LogItem } from "@/lib/types";
import type { LivePerson } from "@/lib/live";

/**
 * Pocket mode: the whole app as a small handheld player with a rotary wheel.
 * A monochrome amber screen, a knurled dial that scrolls, a center key that selects,
 * four keys underneath. Everything here reads from the same APIs as the big UI.
 */

type Kind = "menu" | "reel" | "live" | "log" | "now" | "settings";

type Playable = {
  trackId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  previewUrl: string | null;
  from: string | null;
};

type Row = {
  id: string;
  label: string;
  sub?: string;
  right?: string;
  play?: Playable;
  run?: () => void;
  dim?: boolean;
};

const SCREEN_TITLES: Record<Kind, string> = {
  menu: "Crate",
  reel: "Log",
  live: "Live",
  log: "History",
  now: "Now Playing",
  settings: "Settings",
};

const VISIBLE_ROWS = 6;

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A short click through WebAudio; created on the first gesture, silent until then. */
function useTick() {
  const ctx = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(true);
  const tick = useCallback(
    (hz = 1800) => {
      if (!on) return;
      try {
        if (!ctx.current) ctx.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const c = ctx.current;
        if (c.state === "suspended") c.resume().catch(() => undefined);
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "square";
        o.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.03, c.currentTime + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.018);
        o.connect(g).connect(c.destination);
        o.start();
        o.stop(c.currentTime + 0.02);
      } catch {
        /* no audio */
      }
    },
    [on],
  );
  return { tick, on, setOn };
}

export function Pocket() {
  const { me, crew, setPocket } = useStore();
  const player = usePlayer();
  const { tick, on: clicks, setOn: setClicks } = useTick();

  const [stack, setStack] = useState<Kind[]>(["menu"]);
  const [sel, setSel] = useState<Record<Kind, number>>({
    menu: 0,
    reel: 0,
    live: 0,
    log: 0,
    now: 0,
    settings: 0,
  });
  const [now, setNow] = useState<Playable | null>(null);
  const [nowList, setNowList] = useState<Playable[]>([]);
  const [sends, setSends] = useState<Send[]>([]);
  const [log, setLog] = useState<LogItem[]>([]);
  const [live, setLive] = useState<LivePerson[]>([]);
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [clock, setClock] = useState("");
  const [scale, setScale] = useState(1);
  const screen = stack[stack.length - 1];
  const crewId = crew?.id ?? null;

  // Data.
  useEffect(() => {
    setTheme(getThemeMode());
    if (!crewId) return;
    api<{ sends: Send[] }>(`/api/sends?crew=${encodeURIComponent(crewId)}&view=all`)
      .then((r) => setSends(r.sends))
      .catch(() => undefined);
    api<{ items: LogItem[] }>("/api/log")
      .then((r) => setLog(r.items.slice(0, 60)))
      .catch(() => undefined);
  }, [crewId]);
  useEffect(() => {
    if (!crewId) return;
    const load = () =>
      api<{ people: LivePerson[] }>(`/api/live?crew=${encodeURIComponent(crewId)}`)
        .then((r) => setLive(r.people))
        .catch(() => undefined);
    load();
    const id = setInterval(load, screen === "live" ? 8000 : 30000);
    return () => clearInterval(id);
  }, [crewId, screen]);

  // Clock in the header.
  useEffect(() => {
    const f = () =>
      setClock(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    f();
    const id = setInterval(f, 15000);
    return () => clearInterval(id);
  }, []);

  // Fit the device on small screens.
  useEffect(() => {
    const f = () => setScale(Math.min(1, (window.innerHeight - 72) / 596, (window.innerWidth - 24) / 332));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const playableOf = useCallback(
    (s: Send): Playable => ({
      trackId: s.track.id,
      title: s.track.title,
      artist: s.track.artist,
      artworkUrl: s.track.artworkUrl,
      previewUrl: s.track.previewUrl,
      from: s.from.name.split(" ")[0],
    }),
    [],
  );

  const push = useCallback(
    (k: Kind) => {
      tick(1400);
      setStack((s) => [...s, k]);
    },
    [tick],
  );
  const pop = useCallback(() => {
    tick(1100);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, [tick]);

  const startPlaying = useCallback(
    (p: Playable, list: Playable[]) => {
      setNow(p);
      setNowList(list);
      if (p.previewUrl) player.play(p.trackId, p.previewUrl);
      push("now");
    },
    [player, push],
  );

  // Rows for the current list screen.
  const rows = useMemo<Row[]>(() => {
    const liveCount = live.filter((p) => p.live).length;
    switch (screen) {
      case "menu":
        return [
          {
            id: "reel",
            label: "Log",
            right: sends.length ? String(sends.length) : undefined,
            run: () => push("reel"),
          },
          {
            id: "live",
            label: "Live",
            right: liveCount ? `${liveCount} on` : undefined,
            run: () => push("live"),
          },
          { id: "log", label: "History", run: () => push("log") },
          ...(now
            ? [
                {
                  id: "now",
                  label: "Now Playing",
                  right: player.playing ? ">" : "||",
                  run: () => push("now"),
                },
              ]
            : []),
          { id: "settings", label: "Settings", run: () => push("settings") },
          { id: "exit", label: "Back to Crate", run: () => setPocket(false) },
        ];
      case "reel":
        return sends.length
          ? sends.map((s) => ({
              id: s.id,
              label: s.track.title,
              sub: `${s.track.artist} · ${s.from.name.split(" ")[0]}`,
              play: playableOf(s),
            }))
          : [
              {
                id: "none",
                label: "Nothing new",
                sub: "The reel is empty",
                dim: true,
              },
            ];
      case "live":
        return live.length
          ? live.map((p) => ({
              id: p.person.id,
              label: `${p.live ? "> " : ""}${p.person.id === me.id ? "You" : p.person.name.split(" ")[0]}`,
              sub: p.title ? `${p.title} · ${p.artist ?? ""}` : p.updatedAt ? `quiet · ${timeAgo(p.updatedAt)}` : "quiet",
              play: p.track
                ? {
                    trackId: p.track.id,
                    title: p.track.title,
                    artist: p.track.artist,
                    artworkUrl: p.track.artworkUrl,
                    previewUrl: p.track.previewUrl,
                    from: p.person.name.split(" ")[0],
                  }
                : undefined,
              dim: !p.live && !p.track,
            }))
          : [{ id: "none", label: "Nobody yet", dim: true }];
      case "log":
        return log.length
          ? log.map((i) => ({
              id: i.id,
              label: i.track.title,
              sub: `${i.track.artist} · ${i.action}`,
              play: {
                trackId: i.track.id,
                title: i.track.title,
                artist: i.track.artist,
                artworkUrl: i.track.artworkUrl,
                previewUrl: i.track.previewUrl,
                from: null,
              },
            }))
          : [{ id: "none", label: "Nothing yet", dim: true }];
      case "settings":
        return [
          {
            id: "theme",
            label: "Theme",
            right: theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark",
            run: () => {
              const next: ThemeMode = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
              setThemeMode(next);
              setTheme(next);
            },
          },
          {
            id: "clicks",
            label: "Clicks",
            right: clicks ? "On" : "Off",
            run: () => setClicks((c) => !c),
          },
          {
            id: "name",
            label: "Signed in",
            right: me.name.split(" ")[0],
            dim: true,
          },
          { id: "exit", label: "Back to Crate", run: () => setPocket(false) },
        ];
      default:
        return [];
    }
  }, [screen, sends, live, log, now, player.playing, theme, clicks, me.id, me.name, push, playableOf, setPocket, setClicks]);

  const index = Math.min(sel[screen] ?? 0, Math.max(0, rows.length - 1));
  const listOf = useCallback(() => rows.map((r) => r.play).filter((p): p is Playable => !!p), [rows]);

  const move = useCallback(
    (d: number) => {
      if (screen === "now") return;
      setSel((s) => {
        const cur = Math.min(s[screen] ?? 0, Math.max(0, rows.length - 1));
        const next = Math.max(0, Math.min(rows.length - 1, cur + d));
        if (next !== cur) tick();
        return next === cur ? s : { ...s, [screen]: next };
      });
    },
    [screen, rows.length, tick],
  );

  const select = useCallback(() => {
    if (screen === "now") {
      tick(1400);
      player.toggle();
      return;
    }
    const r = rows[index];
    if (!r || r.dim) return;
    if (r.play) startPlaying(r.play, listOf());
    else r.run?.();
  }, [screen, rows, index, startPlaying, listOf, player, tick]);

  const step = useCallback(
    (d: number) => {
      if (!now || !nowList.length) return;
      const i = nowList.findIndex((p) => p.trackId === now.trackId);
      // Skip entries with nothing to play, but never loop forever.
      let n: Playable | undefined;
      for (let k = 1; k <= nowList.length; k++) {
        const c = nowList[(i + d * k + nowList.length * k) % nowList.length];
        if (c && c.previewUrl) {
          n = c;
          break;
        }
      }
      if (!n) n = nowList[(i + d + nowList.length) % nowList.length];
      if (!n) return;
      tick(1400);
      setNow(n);
      if (n.previewUrl) player.play(n.trackId, n.previewUrl);
      else player.pause();
    },
    [now, nowList, player, tick],
  );

  // A pick with no preview moves on to the next one that has one, after a beat.
  useEffect(() => {
    if (screen !== "now" || !now || now.previewUrl) return;
    if (!nowList.some((p) => p.previewUrl && p.trackId !== now.trackId)) return;
    const t = setTimeout(() => step(1), 1400);
    return () => clearTimeout(t);
  }, [screen, now, nowList, step]);

  // When a preview ends, the next one starts: the little player keeps going.
  useEffect(() => {
    if (screen !== "now" || !now || player.playing || player.progress < 1) return;
    if (player.currentId !== now.trackId) return;
    step(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.playing, player.progress]);

  const playPause = useCallback(() => {
    tick(1400);
    if (now?.previewUrl) {
      if (player.currentId === now.trackId) player.toggle();
      else player.play(now.trackId, now.previewUrl);
      if (screen !== "now") push("now");
      return;
    }
    const first = listOf()[0];
    if (first) startPlaying(first, listOf());
  }, [now, player, screen, push, listOf, startPlaying, tick]);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        select();
      } else if (e.key === "Backspace" || e.key === "Escape") {
        e.preventDefault();
        if (stack.length > 1) pop();
        else if (e.key === "Escape") setPocket(false);
      } else if (e.key === " ") {
        e.preventDefault();
        playPause();
      } else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [move, select, pop, stack.length, setPocket, playPause, step]);

  // The wheel: drag around it to scroll, one step per 22 degrees.
  const wheel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ angle: number; acc: number; moved: boolean } | null>(null);
  const angleAt = (e: PointerEvent | React.PointerEvent) => {
    const r = wheel.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    wheel.current?.setPointerCapture(e.pointerId);
    drag.current = { angle: angleAt(e), acc: 0, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const a = angleAt(e);
    let d = a - drag.current.angle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.current.angle = a;
    drag.current.acc += d;
    while (drag.current.acc >= 22) {
      drag.current.acc -= 22;
      drag.current.moved = true;
      move(1);
    }
    while (drag.current.acc <= -22) {
      drag.current.acc += 22;
      drag.current.moved = true;
      move(-1);
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) < 8) return;
    move(e.deltaY > 0 ? 1 : -1);
  };

  // Keep the selected row in view.
  const top = Math.max(0, Math.min(index - Math.floor(VISIBLE_ROWS / 2), rows.length - VISIBLE_ROWS));
  const visible = rows.slice(top, top + VISIBLE_ROWS);

  const nowPlayingThis = !!now && player.currentId === now.trackId;
  const progress = nowPlayingThis ? player.progress : 0;
  const durationMs = 30_000;

  return (
    <div className="pocket-root" role="dialog" aria-label="Pocket player" onWheel={onWheel}>
      <button className="pocket-exit caps" onClick={() => setPocket(false)}>
        Back to Crate
      </button>
      <div
        className="pocket-fit"
        style={{
          width: Math.round(332 * scale),
          height: Math.round(596 * scale),
        }}
      >
        <div className="pocket" style={{ transform: `scale(${scale})` }}>
          <div className="pocket__screen">
            <div className="lcd" aria-live="polite">
              <div className="lcd__bar">
                <span className="lcd__title">{SCREEN_TITLES[screen]}</span>
                <span className="lcd__status">
                  {player.playing ? ">" : now ? "||" : ""} {clock}
                </span>
              </div>

              {screen === "now" && now && (
                <div className="lcd__now">
                  <div className="lcd__art">
                    {now.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={now.artworkUrl} alt="" draggable={false} />
                    ) : (
                      <span>♪</span>
                    )}
                  </div>
                  <div className="lcd__nowtext">
                    <div className="lcd__nowtitle">{now.title}</div>
                    <div className="lcd__nowline">{now.artist}</div>
                    {now.from && <div className="lcd__nowline lcd__dim">from {now.from}</div>}
                    {!now.previewUrl && <div className="lcd__nowline lcd__dim">no preview here, skipping</div>}
                  </div>
                  <div className="lcd__progress">
                    <span className="lcd__time">{fmt(progress * durationMs)}</span>
                    <span className="lcd__track">
                      <span className="lcd__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </span>
                    <span className="lcd__time">-{fmt((1 - progress) * durationMs)}</span>
                  </div>
                </div>
              )}

              {screen !== "now" && (
                <ul className="lcd__list" role="listbox" aria-activedescendant={rows[index]?.id}>
                  {visible.map((r, i) => {
                    const isSel = top + i === index;
                    return (
                      <li key={r.id} id={r.id} role="option" aria-selected={isSel} className={`lcd__row${isSel ? " is-sel" : ""}${r.dim ? " is-dim" : ""}`}>
                        <span className="lcd__label">
                          {r.label}
                          {r.sub && <span className="lcd__sub"> {r.sub}</span>}
                        </span>
                        <span className="lcd__right">{r.right ?? (r.play || r.run ? ">" : "")}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {screen === "now" && !now && <div className="lcd__text lcd__dim">Pick something from the playlist.</div>}
              <div className="lcd__scan" aria-hidden />
            </div>
          </div>

          <div
            className="pocket__wheel"
            ref={wheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="group"
            aria-label="Scroll wheel"
          >
            <div className="pocket__knurl" aria-hidden />
            <button className="pocket__ok" onClick={select} aria-label="Select">
              <span />
            </button>
          </div>

          <div className="pocket__keys">
            <button className="pocket__key" onClick={() => (stack.length > 1 ? pop() : setPocket(false))} aria-label="Back" title="Back">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3L5 8l5 5" />
              </svg>
            </button>
            <button className="pocket__key" onClick={() => step(-1)} aria-label="Previous" title="Previous">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 3h1.6v10H4zM12 3v10L6 8z" />
              </svg>
            </button>
            <button className="pocket__key pocket__key--play" onClick={playPause} aria-label={player.playing ? "Pause" : "Play"} title="Play / pause">
              {player.playing ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 3h3v10H4zM9 3h3v10H9z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5 3l8 5-8 5z" />
                </svg>
              )}
            </button>
            <button className="pocket__key" onClick={() => step(1)} aria-label="Next" title="Next">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.4 3H12v10h-1.6zM4 3v10l6-5z" />
              </svg>
            </button>
          </div>
          <div className="pocket__grille" aria-hidden />
          <div className="pocket__brand" aria-hidden>
            crate
          </div>
        </div>
      </div>
      <p className="pocket-hint caps">
        Spin the wheel · press the center · arrows and space work too
        {!crew ? " · start a crew first" : ""}
      </p>
    </div>
  );
}
