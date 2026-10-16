"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Reel } from "./Reel";
import { LiveBand } from "./LiveView";
import { Sheet } from "./Sheet";
import { TrackCard } from "./TrackCard";
import { Avatar } from "./Avatar";
import { SourceMark, platformOfVia } from "./SourceMark";
import { IconPlay, IconPause, IconKeep, IconDeck } from "./Icons";
import { api, timeAgo, viaLabel } from "@/lib/client";
import type { Playlist, Send, ReactionStatus, Track } from "@/lib/types";

/**
 * The crew's playlist: every send, newest first, under the agent's name for it.
 * New-to-you tracks are caught up on the swipe stage; the rest is the list.
 */
export function PlaylistView() {
  const { me, crew, toast, sendsVersion, setAccentTrack } = useStore();
  const player = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [mode, setMode] = useState<"stage" | "list">("stage");
  const [open, setOpen] = useState<Send | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const decided = useRef<string | null>(null);
  const crewId = crew?.id ?? null;

  const load = useCallback(async () => {
    if (!crewId) return;
    try {
      const r = await api<{ playlist: Playlist }>(`/api/playlist?crew=${encodeURIComponent(crewId)}`);
      setPlaylist(r.playlist);
      // First look at a crew: start on the stage when there is something new, else the list.
      if (decided.current !== crewId) {
        decided.current = crewId;
        setMode(r.playlist.unseen > 0 ? "stage" : "list");
      }
    } catch (e) {
      toast((e as Error).message);
    }
  }, [crewId, toast]);

  useEffect(() => {
    setPlaylist(null);
    setWho(null);
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

  // In list mode the page takes the color of whatever is playing, or nothing.
  useEffect(() => {
    if (mode !== "list") return;
    const t = playlist?.sends.find((s) => s.track.id === player.currentId)?.track ?? null;
    setAccentTrack(t);
  }, [mode, player.currentId, playlist, setAccentTrack]);

  // Play all: when a preview ends, start the next one down the list.
  useEffect(() => {
    if (!playingAll || !playlist || player.playing || player.progress < 1) return;
    const i = playlist.sends.findIndex((s) => s.track.id === player.currentId);
    const next = playlist.sends.slice(i + 1).find((s) => s.track.previewUrl);
    if (next) player.play(next.track.id, next.track.previewUrl);
    else setPlayingAll(false);
  }, [playingAll, player.playing, player.progress, player.currentId, playlist, player]);

  function patchSend(updated: Send) {
    setPlaylist((p) => (p ? { ...p, sends: p.sends.map((s) => (s.id === updated.id ? updated : s)) } : p));
    setOpen((o) => (o && o.id === updated.id ? updated : o));
  }
  function patchTrack(t: Track) {
    setPlaylist((p) => (p ? { ...p, sends: p.sends.map((s) => (s.track.id === t.id ? { ...s, track: t } : s)) } : p));
    setOpen((o) => (o && o.track.id === t.id ? { ...o, track: t } : o));
  }
  async function react(send: Send, status: ReactionStatus, reply?: string) {
    try {
      const r = await api<{ send: Send }>(`/api/sends/${send.id}/react`, { method: "POST", json: reply === undefined ? { status } : { status, reply } });
      patchSend(r.send);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const byLine = useMemo(() => {
    if (!crew) return "";
    const names = crew.members.map((m) => (m.id === me.id ? "you" : m.name.split(" ")[0]));
    return names.length === 1 ? "just you" : names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }, [crew, me.id]);

  /** Everyone who brought a track up: whoever sent it, then whoever echoed it. */
  const facesOf = useCallback((s: Send) => {
    const seen = new Set<string>();
    return [s.from, ...s.echoes.map((e) => e.person)].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, []);

  // Per person: how many tracks in here carry their face.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of playlist?.sends ?? []) for (const p of facesOf(s)) c.set(p.id, (c.get(p.id) ?? 0) + 1);
    return c;
  }, [playlist, facesOf]);

  const rows = useMemo(() => {
    const all = playlist?.sends ?? [];
    return who ? all.filter((s) => facesOf(s).some((p) => p.id === who)) : all;
  }, [playlist, who, facesOf]);

  if (!crew) return <Reel />;

  const count = playlist?.count ?? 0;
  const unseen = playlist?.unseen ?? 0;
  const showStage = mode === "stage" && (unseen > 0 || playlist === null);
  const together = crew.members.length > 1;

  return (
    <div className="pl">
      <LiveBand />
      <header className="pl__head">
        <div className="pl__titles">
          <span className="caps">{crew.name}</span>
          <Link href="/crew" className="pl__namelink" title={playlist?.namedBy === "human" ? "Rename" : "Named after the moment. Rename it on the crew page."}>
            <h1 className="display pl__name">{playlist?.name ?? "…"}</h1>
          </Link>
          <span className="muted pl__by">
            {byLine} · {count === 1 ? "1 track" : `${count} tracks`}
            {!together && (
              <>
                {" · "}
                <Link href="/crew" className="pl__invite">
                  Invite someone
                </Link>
              </>
            )}
          </span>
        </div>
        <div className="pl__actions">
          {unseen > 0 && (
            <button className={`btn btn--sm${showStage ? "" : " btn--accent"}`} onClick={() => setMode(showStage ? "list" : "stage")}>
              {showStage ? "Show the playlist" : `Catch up · ${unseen} new`}
            </button>
          )}
          {count > 0 && !showStage && (
            <button
              className="btn btn--sm"
              onClick={() => {
                if (playingAll) {
                  setPlayingAll(false);
                  player.pause();
                  return;
                }
                const first = playlist!.sends.find((s) => s.track.previewUrl);
                if (!first) return toast("No previews in here yet");
                setPlayingAll(true);
                player.play(first.track.id, first.track.previewUrl);
              }}
            >
              {playingAll ? <IconPause size={14} /> : <IconPlay size={14} />} {playingAll ? "Stop" : "Play all"}
            </button>
          )}
        </div>
      </header>

      {showStage || count === 0 ? (
        <Reel
          embedded
          onCaughtUp={() => {
            setMode("list");
            setTimeout(load, 700);
          }}
        />
      ) : (
        <>
          {together && (
            <div className="people" role="tablist" aria-label="Whose tracks">
              <button role="tab" aria-selected={who === null} className={`people__chip${who === null ? " is-on" : ""}`} onClick={() => setWho(null)}>
                Everyone
              </button>
              {crew.members.map((m) => (
                <button key={m.id} role="tab" aria-selected={who === m.id} className={`people__chip${who === m.id ? " is-on" : ""}`} onClick={() => setWho(who === m.id ? null : m.id)}>
                  <Avatar name={m.name} url={m.avatarUrl} size={20} />
                  {m.id === me.id ? "You" : m.name.split(" ")[0]}
                  <span className="people__n num">{counts.get(m.id) ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        <ul className="pl__list">
          {rows.map((s) => {
            const isCur = player.currentId === s.track.id;
            const status = s.reaction?.status;
            const mine = s.from.id === me.id;
            const intentional = !s.via.startsWith("played:");
            const faces = facesOf(s);
            return (
              <li
                key={s.id}
                className={`pl__row${isCur && player.playing ? " is-playing" : ""}${!mine && intentional && (!status || status === "seen") ? " is-new" : ""}`}
                onClick={() => setOpen(s)}
              >
                <div className="log__artwrap pl__artwrap">
                  {s.track.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="row__art" src={s.track.artworkUrl} alt="" />
                  ) : (
                    <div className="row__art" />
                  )}
                  {s.track.previewUrl && (
                    <button
                      className="log__play"
                      aria-label={isCur && player.playing ? "Pause" : "Preview"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlayingAll(false);
                        player.play(s.track.id, s.track.previewUrl);
                      }}
                    >
                      {isCur && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                    </button>
                  )}
                </div>
                <div className="pl__main">
                  <div className="row__title pl__title">{s.track.title}</div>
                  <div className="row__sub pl__sub">{s.track.artist}</div>
                </div>
                <div className="pl__meta">
                  {together && (
                    <span
                      className={`faces${faces.length > 1 ? " is-many" : ""}`}
                      title={faces.map((p) => (p.id === me.id ? "You" : p.name.split(" ")[0])).join(", ") + (viaLabel(s.via) ? ` · ${viaLabel(s.via)}` : "")}
                    >
                      {faces.slice(0, 3).map((p) => (
                        <Avatar key={p.id} name={p.name} url={p.avatarUrl} size={22} />
                      ))}
                    </span>
                  )}
                  <SourceMark kind={platformOfVia(s.via)} />
                  <span className="pl__when num">{timeAgo(s.activeAt)}</span>
                  {status === "saved" && (
                    <span className="pl__badge" title="Kept">
                      <IconKeep size={12} />
                    </span>
                  )}
                  {status === "played" && (
                    <span className="pl__badge" title="Played out">
                      <IconDeck size={12} />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          {rows.length === 0 && who && <li className="muted pl__none">Nothing from them in here yet.</li>}
        </ul>
        </>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} label="Track">
        {open && (
          <TrackCard
            send={open}
            analyzing={false}
            onSave={open.from.id === me.id ? undefined : () => react(open, "saved").then(() => toast("Kept"))}
            onPlayed={open.from.id === me.id ? undefined : () => react(open, "played").then(() => toast("Marked as played out"))}
            onReply={(text) => react(open, open.reaction?.status ?? "seen", text).then(() => toast("Sent back"))}
            onTrackChange={patchTrack}
          />
        )}
      </Sheet>
    </div>
  );
}
