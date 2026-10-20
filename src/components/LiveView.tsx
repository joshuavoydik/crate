"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Sheet } from "./Sheet";
import { SourceMark } from "./SourceMark";
import { IconPlay, IconPause, IconPlus } from "./Icons";
import { api, initials, timeAgo, sourceName } from "@/lib/client";
import { openable, PLATFORM_LABELS } from "@/lib/resolve/links";
import type { LivePerson, LiveSession } from "@/lib/live";
import { artFallback } from "./Avatar";

type LiveResponse = { people: LivePerson[]; history: LiveSession[]; tunedIn: number; now: number };

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Elapsed position for a person, extrapolated from the last report. */
function positionOf(p: LivePerson, now: number): number | null {
  if (!p.live) return null;
  if (p.progressMs != null && p.updatedAt) return p.progressMs + (now - p.updatedAt);
  if (p.startedAt) return now - p.startedAt;
  return null;
}

export function useLive(crewId: string | null, everyMs: number, opts: { tune?: boolean; history?: boolean } = {}) {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [skew, setSkew] = useState(0);
  /** When the last fetch failed: the page keeps what it had and says it is out of touch. */
  const [stale, setStale] = useState(false);
  const tune = !!opts.tune;
  const history = !!opts.history;
  const load = useCallback(async () => {
    if (!crewId) return;
    try {
      const r = await api<LiveResponse>(`/api/live?crew=${encodeURIComponent(crewId)}&tune=${tune ? 1 : 0}&history=${history ? 1 : 0}`);
      setSkew(Date.now() - r.now);
      setData(r);
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [crewId, tune, history]);
  useEffect(() => {
    load();
    let id: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, everyMs);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      if (id) clearInterval(id);
      id = null;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [load, everyMs]);
  return { data, skew, stale, reload: load };
}

/** A clock that ticks once a second while mounted. */
export function useNow(): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function LiveView() {
  const { me, crew, setAccentTrack, openSend, toast, refreshMe } = useStore();
  const player = usePlayer();
  const { data, skew, stale } = useLive(crew?.id ?? null, 8000, { tune: true, history: true });
  const now = useNow() - skew;
  const [open, setOpen] = useState<LivePerson | null>(null);
  const [following, setFollowing] = useState<{ id: string; song: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const hasSpotify = me.sources.some((s) => s.kind === "spotify");

  const people = useMemo(() => data?.people ?? [], [data]);
  const liveCount = people.filter((p) => p.live).length;
  const lead = people.find((p) => p.live && p.track) ?? null;

  /** Play what someone is playing on my own Spotify, now, at their position. */
  const follow = useCallback(
    async (p: LivePerson, quiet = false) => {
      if (!crew) return;
      if (!hasSpotify) {
        toast("Connect Spotify in Settings and you can follow along in your own app.");
        return;
      }
      setBusy(true);
      try {
        const r = await api<{ title: string; artist: string; device: string | null }>("/api/live/follow", {
          method: "POST",
          json: { crew: crew.id, userId: p.person.id },
        });
        setFollowing({ id: p.person.id, song: `${p.title}|${p.artist}` });
        if (!quiet) toast(`Playing ${r.title} on your Spotify${r.device ? ` (${r.device})` : ""}`);
        setOpen(null);
      } catch (e) {
        toast((e as Error).message);
        setFollowing(null);
      } finally {
        setBusy(false);
      }
    },
    [crew, hasSpotify, toast],
  );

  // Following someone: when their song changes, mine follows; when they stop, so do I.
  useEffect(() => {
    if (!following) return;
    const p = people.find((x) => x.person.id === following.id);
    if (!p) return;
    if (!p.live) {
      setFollowing(null);
      toast(`${p.person.name.split(" ")[0]} stopped. You are on your own now.`);
      return;
    }
    const song = `${p.title}|${p.artist}`;
    if (song !== following.song) follow(p, true);
  }, [people, following, follow, toast]);

  useEffect(() => {
    setAccentTrack(lead?.track ?? null);
  }, [lead?.track?.id, setAccentTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first look at Live is what checks the platforms; pick up a source that just asked to be reconnected.
  const refreshed = useRef(false);
  useEffect(() => {
    if (!data || refreshed.current) return;
    refreshed.current = true;
    refreshMe();
  }, [data, refreshMe]);

  if (!crew) {
    return (
      <div className="empty">
        <h2 className="display empty__title">No crew yet.</h2>
        <p className="muted">Start one from the top left and share the invite link.</p>
      </div>
    );
  }

  const nobodyConnected = !people.some((p) => p.source && p.source !== "none");
  const needsReconnect = (me.notices ?? []).filter((n) => n.kind === "reconnect" && n.action?.href.startsWith("/api/connect/"));

  return (
    <div className="page live">
      <div className="page__head">
        <h1 className="display page__title">
          Live
          {liveCount > 0 && <i className="beacon beacon--title" aria-label="on air" />}
        </h1>
        <span className="caps live__status">
          {following && (
            <button className="live__following" onClick={() => setFollowing(null)} title="Stop following">
              <i className="live__dot" /> Following {people.find((x) => x.person.id === following.id)?.person.name.split(" ")[0] ?? ""} · stop
            </button>
          )}
          {stale ? (
            <span title="The last check did not get through; this is what Crate last heard">Out of touch · retrying</span>
          ) : data ? (
            <>
              {liveCount ? `${liveCount} playing` : "Quiet right now"}
              {data.tunedIn > 1 ? <span className="live__tuned"> · {data.tunedIn} tuned in</span> : null}
            </>
          ) : (
            "Listening…"
          )}
        </span>
      </div>

      {needsReconnect.map((n) => (
        <div key={n.id} className="live__notice" role="status">
          <span>{n.body ?? n.title}</span>
          <a className="btn btn--sm btn--primary" href={n.action!.href}>
            {n.action!.label}
          </a>
        </div>
      ))}

      <div className="live__grid" aria-live="polite">
        {people.map((p) => (
          <Orb
            key={p.person.id}
            p={p}
            now={now}
            isMe={p.person.id === me.id}
            onOpen={() => setOpen(p)}
            following={following?.id === p.person.id}
            onFollow={p.live && p.person.id !== me.id ? () => follow(p) : undefined}
          />
        ))}
        {!data &&
          crew.members.map((m) => (
            <div key={m.id} className="orb" aria-busy>
              <div className="orb__disc skeleton" />
            </div>
          ))}
      </div>

      {data && nobodyConnected && liveCount === 0 && (
        <p className="muted live__hint">
          What you have on shows up here as you play it. On a Mac,{" "}
          <Link href="/settings#mac" style={{ textDecoration: "underline" }}>
            Crate on your Mac
          </Link>{" "}
          follows the Music, Spotify and SoundCloud apps; in Chrome on a computer,{" "}
          <Link href="/chrome" style={{ textDecoration: "underline" }}>
            Crate in Chrome
          </Link>{" "}
          follows SoundCloud, YouTube and most music sites. From a phone,{" "}
          <Link href="/settings" style={{ textDecoration: "underline" }}>
            connect Spotify
          </Link>{" "}
          (or Last.fm, if you scrobble) and this page follows your Spotify app.
        </p>
      )}

      {data && data.history.length > 0 && (
        <History
          sessions={data.history}
          meId={me.id}
          onPlay={(t) => t.previewUrl && player.play(t.id, t.previewUrl)}
          playingId={player.playing ? player.currentId : null}
        />
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} label="Now playing">
        {open && (
          <div className="livesheet">
            {open.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="livesheet__art" src={open.artworkUrl} alt="" onError={artFallback} />
            ) : (
              <div className="livesheet__art" />
            )}
            <div className="caps" style={{ marginTop: 18 }}>
              {open.live
                ? `${open.person.name.split(" ")[0]} is playing`
                : open.updatedAt
                  ? `${open.person.name.split(" ")[0]} played ${timeAgo(open.updatedAt)}`
                  : open.person.name}
              {open.source && open.source !== "crate" && open.source !== "none"
                ? ` · ${sourceName(open.source)}`
                : open.source === "crate"
                  ? " · in Crate"
                  : ""}
            </div>
            <h2 className="display livesheet__title">{open.title ?? "Nothing yet"}</h2>
            <div className="muted">{open.artist}</div>
            <div className="livesheet__actions">
              {open.live && open.person.id !== me.id && (
                <button className="btn btn--sm btn--primary" onClick={() => follow(open)} disabled={busy}>
                  {following?.id === open.person.id ? "Following along" : "Follow along"}
                </button>
              )}
              {open.track?.previewUrl && (
                <button className="btn btn--sm" onClick={() => player.play(open.track!.id, open.track!.previewUrl)}>
                  {player.currentId === open.track.id && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />} Preview
                </button>
              )}
              {open.track &&
                openable(open.track.links, me.preferredPlatform)
                  .direct.slice(0, 2)
                  .map((k) => (
                    <a key={k} className="btn btn--sm btn--ghost" href={open.track!.links[k]!.url} target="_blank" rel="noreferrer">
                      Open in {PLATFORM_LABELS[k]}
                    </a>
                  ))}
              {(!open.track || !openable(open.track.links, me.preferredPlatform).direct.length) && open.url && (
                <a className="btn btn--sm btn--ghost" href={open.url} target="_blank" rel="noreferrer">
                  Open
                </a>
              )}
              {(open.url || open.track) && open.person.id !== me.id && (
                <button
                  className="btn btn--sm btn--accent"
                  onClick={() => {
                    setOpen(null);
                    openSend(open.track?.links.spotify?.url ?? open.track?.links.apple?.url ?? open.url ?? null);
                  }}
                >
                  <IconPlus size={14} /> Send to crew
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export function Orb({
  p,
  now,
  isMe,
  onOpen,
  following = false,
  onFollow,
}: {
  p: LivePerson;
  now: number;
  isMe: boolean;
  onOpen: () => void;
  following?: boolean;
  onFollow?: () => void;
}) {
  const player = usePlayer();
  const [stopped, setStopped] = useState(false);
  const pos = positionOf(p, now);
  const frac = pos != null && p.durationMs ? Math.min(1, pos / p.durationMs) : null;
  const first = p.person.name.split(" ")[0];
  const r = 46;
  const c = 2 * Math.PI * r;
  const accent = p.track?.accent ?? null;
  const style = useMemo(() => ({ "--orb-accent": accent ?? "var(--accent)" }) as React.CSSProperties, [accent]);

  const track = p.track;
  const inMyPlayer = !!track && player.currentId === track.id;
  // My own Crate record is my player: it turns while the preview plays and stops when it stops.
  const mineInCrate = isMe && p.source === "crate";
  const spinning = mineInCrate ? inMyPlayer && player.playing : p.live && !stopped;

  // A new song from them starts the record again.
  useEffect(() => setStopped(false), [p.title, p.artist]);

  function tap() {
    if (mineInCrate) {
      if (track?.previewUrl) {
        if (inMyPlayer) player.toggle();
        else player.play(track.id, track.previewUrl);
      }
      return;
    }
    if (spinning) {
      setStopped(true);
      if (inMyPlayer && player.playing) player.pause();
      return;
    }
    setStopped(false);
    if (track?.previewUrl) {
      if (inMyPlayer) player.toggle();
      else player.play(track.id, track.previewUrl);
    }
  }

  return (
    <div className={`orb${p.live ? " is-live" : ""}${spinning ? " is-spinning" : ""}${isMe ? " is-me" : ""}`} style={style}>
      <button
        className="orb__stage"
        onClick={tap}
        aria-label={`${first}: ${p.title ?? "nothing playing"}. ${spinning ? "Tap to stop" : track?.previewUrl ? "Tap to play the preview" : "Tap to start"}`}
      >
        <svg className="orb__arc" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={r} className="orb__arc-track" />
          {frac != null && <circle cx="50" cy="50" r={r} className="orb__arc-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />}
        </svg>
        <span className="orb__disc">
          <span className="orb__grooves" />
          {p.artworkUrl || p.person.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="orb__label" src={p.artworkUrl ?? p.person.avatarUrl ?? ""} alt="" draggable={false} onError={artFallback} />
          ) : (
            <span className="orb__label orb__label--empty">{initials(p.person.name)}</span>
          )}
          <span className="orb__hole" />
        </span>
      </button>
      <button className="orb__text" onClick={onOpen} aria-label={`About ${p.title ?? first}`}>
        <span className="orb__who caps">
          {p.live && <i className="live__dot" />}
          {isMe ? "You" : first}
          {p.live ? "" : p.updatedAt ? ` · ${timeAgo(p.updatedAt)}` : " · quiet"}
          {p.title && p.source && p.source !== "none" ? <SourceMark kind={p.source} size={14} className="orb__src" /> : null}
        </span>
        {p.title ? (
          <>
            <span className="orb__title">{p.title}</span>
            <span className="orb__artist">{p.artist}</span>
          </>
        ) : (
          <span className="orb__artist">Nothing playing</span>
        )}
        <span className="orb__meta num">{p.live && pos != null ? (p.durationMs ? `${fmt(pos)} / ${fmt(p.durationMs)}` : fmt(pos)) : ""}</span>
      </button>
      {onFollow && (
        <button className={`btn btn--sm orb__follow${following ? " btn--accent" : ""}`} onClick={onFollow}>
          {following ? "Following" : "Follow along"}
        </button>
      )}
    </div>
  );
}

/** A one-line pulse for the Playlist page: who is playing right now, if anyone. */
export function LiveBand() {
  const { me, crew } = useStore();
  const { data } = useLive(crew?.id ?? null, 30000);
  const live = (data?.people ?? []).filter((p) => p.live && p.person.id !== me.id);
  if (!live.length) return null;
  const p = live[0];
  const first = p.person.name.split(" ")[0];
  return (
    <Link
      href="/live"
      className="liveband"
      style={
        {
          "--orb-accent": p.track?.accent ?? "var(--accent)",
        } as React.CSSProperties
      }
    >
      <span className="liveband__disc">
        {p.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.artworkUrl} alt="" onError={artFallback} />
        ) : null}
      </span>
      <span className="liveband__text">
        <i className="live__dot" />
        <strong>{live.length > 1 ? `${first} +${live.length - 1}` : first}</strong>
        {p.title ? (
          <>
            {" "}
            is playing <strong>{p.title}</strong>
            {p.artist ? <span className="faint"> · {p.artist}</span> : null}
          </>
        ) : (
          " is listening"
        )}
      </span>
      <span className="caps liveband__cta">Live</span>
    </Link>
  );
}

function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  const y = new Date(now - 86400000);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Earlier sessions, newest first, grouped by day: little records with when and who. */
export function History({
  sessions,
  meId,
  onPlay,
  playingId,
}: {
  sessions: LiveSession[];
  meId: string | null;
  onPlay: (t: NonNullable<LiveSession["track"]>) => void;
  playingId: string | null;
}) {
  const groups: Array<{ label: string; items: LiveSession[] }> = [];
  for (const s of sessions) {
    const label = dayLabel(s.startedAt);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(s);
    else groups.push({ label, items: [s] });
  }
  return (
    <section className="lh" aria-label="Earlier">
      <div className="caps lh__head">Earlier</div>
      {groups.map((g) => (
        <div key={g.label} className="lh__day">
          <div className="caps lh__daylabel">{g.label}</div>
          <ul className="lh__list">
            {g.items.map((s) => {
              const first = s.person.id === meId ? "You" : s.person.name.split(" ")[0];
              const mins = Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000));
              const canPlay = !!s.track?.previewUrl;
              const isPlaying = !!s.track && playingId === s.track.id;
              return (
                <li key={s.id} className={`lh__row${isPlaying ? " is-playing" : ""}`}>
                  <button
                    className="lh__disc"
                    onClick={() => s.track && canPlay && onPlay(s.track)}
                    aria-label={canPlay ? `Play ${s.title ?? ""}` : (s.title ?? "")}
                    disabled={!canPlay}
                  >
                    <span className={`lh__record${isPlaying ? " is-spinning" : ""}`}>
                      {s.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.artworkUrl} alt="" draggable={false} onError={artFallback} />
                      ) : (
                        <span className="lh__blank" />
                      )}
                    </span>
                  </button>
                  <span className="lh__text">
                    <span className="lh__title">{s.title ?? "Something"}</span>
                    <span className="lh__sub">
                      {s.artist ? `${s.artist} · ` : ""}
                      {first}
                    </span>
                  </span>
                  <span className="lh__when num">
                    <SourceMark kind={s.source} size={15} />
                    {new Date(s.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    {mins > 1 ? <span className="faint"> · {mins} min</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
