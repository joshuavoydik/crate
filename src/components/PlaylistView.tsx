"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Reel } from "./Reel";
import { LiveBand } from "./LiveView";
import { Avatar } from "./Avatar";
import { IconPlay, IconPause, IconShare } from "./Icons";
import { SendRows, DayCards, useTrackSheet, facesOf, tz } from "./Days";
import { api, metaOf } from "@/lib/client";
import type { Playlist, Send } from "@/lib/types";

/** How many earlier days the main page shows before pointing at the Days page. */
const RECENT_DAYS = 7;
/** Today's list folds past this many; the rest is a tap away, like the earlier days beneath it. */
const TODAY_FOLD = 10;

/**
 * The last playlist seen for each crew, for the life of the page. Coming back to the log paints what
 * was there a moment ago at once and the fresh copy replaces it when it lands; no blank, no wrong
 * empty state in between.
 */
const remembered = new Map<string, Playlist>();

/** A few quiet rows while the first copy loads, in the shape of the list, so nothing jumps. */
function Loading() {
  return (
    <div className="pl__loading" aria-busy="true" aria-label="Loading">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="pl__loadrow">
          <div className="skeleton pl__loadart" />
          <div>
            <div className="skeleton" style={{ width: i % 2 ? 150 : 210, height: 14 }} />
            <div className="skeleton" style={{ width: i % 2 ? 90 : 120, height: 11, marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The crew's playlist: today's stream under the name of the moment, with earlier days folded
 * beneath it. New-to-you tracks are caught up on the swipe stage; the rest is the list.
 */
export function PlaylistView({ welcome = false }: { welcome?: boolean }) {
  const { me, crew, toast, sendsVersion, setAccentTrack, openInvite, openSend, openShare, bumpCollections } = useStore();
  const [firstSend, setFirstSend] = useState(welcome);
  const player = usePlayer();
  const crewId = crew?.id ?? null;
  const known = crewId ? (remembered.get(crewId) ?? null) : null;
  const [playlist, setPlaylist] = useState<Playlist | null>(known);
  const [mode, setMode] = useState<"stage" | "list">(known && known.unseen === 0 ? "list" : "stage");
  const [playingAll, setPlayingAll] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [allToday, setAllToday] = useState(false);
  const [decidedFor, setDecidedFor] = useState<string | null>(known ? crewId : null);

  const patchSend = useCallback((updated: Send) => {
    setPlaylist((p) => (p ? { ...p, sends: p.sends.map((s) => (s.id === updated.id ? updated : s)) } : p));
  }, []);
  const { open: openTrack, sheet } = useTrackSheet(patchSend);

  const load = useCallback(async () => {
    if (!crewId) return;
    try {
      const r = await api<{ playlist: Playlist }>(`/api/playlist?crew=${encodeURIComponent(crewId)}&tz=${encodeURIComponent(tz())}`);
      remembered.set(crewId, r.playlist);
      setPlaylist(r.playlist);
      // First look at a crew: start on the stage when there is something new, else the list.
      setDecidedFor((d) => {
        if (d !== crewId) setMode(r.playlist.unseen > 0 ? "stage" : "list");
        return crewId;
      });
    } catch (e) {
      toast((e as Error).message);
    }
  }, [crewId, toast]);

  useEffect(() => {
    setPlaylist(crewId ? (remembered.get(crewId) ?? null) : null);
    setWho(null);
    setAllToday(false);
    load();
  }, [crewId, load]);
  // A send from this page refreshes the list; the mount is already covered above, so the first value is skipped.
  const seenVersion = useRef(sendsVersion);
  useEffect(() => {
    if (seenVersion.current === sendsVersion) return;
    seenVersion.current = sendsVersion;
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

  // Play all (today): when a preview ends, start the next one down the list.
  useEffect(() => {
    if (!playingAll || !playlist || player.playing || player.progress < 1) return;
    const i = playlist.sends.findIndex((s) => s.track.id === player.currentId);
    const next = playlist.sends.slice(i + 1).find((s) => player.canPlay(s.track));
    if (next) player.play(next.track.id, next.track.previewUrl, metaOf(next.track));
    else setPlayingAll(false);
  }, [playingAll, player.playing, player.progress, player.currentId, playlist, player]);

  /** Today, handed on: one tap makes (or refreshes) the day's playlist with its link and offers it. */
  const [sharing, setSharing] = useState(false);
  async function shareToday() {
    if (!playlist || !crew || sharing) return;
    setSharing(true);
    try {
      const r = await api<{ url: string; collection: { covers: string[] } }>("/api/collections/day", {
        method: "POST",
        json: { crew: crew.id, date: playlist.today, tz: tz(), name: playlist.name },
      });
      bumpCollections();
      openShare({ title: playlist.name, subtitle: `Today's playlist from ${crew.name}`, url: r.url, covers: r.collection.covers });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  const byLine = useMemo(() => {
    if (!crew) return "";
    const names = crew.members.map((m) => (m.id === me.id ? "you" : m.name.split(" ")[0]));
    return names.length === 1 ? "just you" : names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }, [crew, me.id]);

  // Per person: how many of today's tracks carry their face.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of playlist?.sends ?? []) for (const p of facesOf(s)) c.set(p.id, (c.get(p.id) ?? 0) + 1);
    return c;
  }, [playlist]);

  const rows = useMemo(() => {
    const all = playlist?.sends ?? [];
    return who ? all.filter((s) => facesOf(s).some((p) => p.id === who)) : all;
  }, [playlist, who]);

  if (!crew) return <Reel />;

  const count = playlist?.count ?? 0;
  const todayCount = playlist?.sends.length ?? 0;
  const unseen = playlist?.unseen ?? 0;
  // Nothing is decided until the playlist is here: no stage, and no empty state, on a guess.
  const showStage = playlist !== null && mode === "stage" && unseen > 0;
  const together = crew.members.length > 1;
  const days = playlist?.days ?? [];

  return (
    <div className="pl">
      {firstSend && (
        <div className="firstsend" role="status">
          <div className="firstsend__text">
            <div className="caps" style={{ color: "var(--signal)" }}>You&rsquo;re in</div>
            <div>
              This is {crew.name}&rsquo;s log: what everyone plays lands here on its own. The thing that makes it good is a song sent by hand with a line about why.
              Send one now, and when you are on a computer, hook up where you listen so your plays show too.
            </div>
          </div>
          <div className="firstsend__actions">
            <button className="btn btn--sm btn--primary" onClick={() => openSend()}>
              Send a song
            </button>
            <Link href="/connect" className="btn btn--sm">
              Where you listen
            </Link>
            <button className="btn btn--sm btn--ghost" onClick={() => setFirstSend(false)}>
              Later
            </button>
          </div>
        </div>
      )}
      <LiveBand />
      <header className="pl__head">
        <div className="pl__titles">
          <Link href="/crew" className="pl__namelink" title={playlist?.namedBy === "human" ? "Rename" : "Named after the moment. Rename it on the crew page."}>
            <h1 className="display pl__name">{playlist?.name ?? "…"}</h1>
          </Link>
          <span className="muted pl__by">
            {byLine}
            {playlist ? ` · ${todayCount ? `${todayCount} today` : "quiet today"}` : ""}
            {count > todayCount ? ` · ${count} all time` : ""}
            {!together && (
              <>
                {" · "}
                <button className="linkbtn pl__invite" onClick={openInvite} type="button">
                  Invite someone
                </button>
              </>
            )}
          </span>
        </div>
        <div className="pl__actions">
          {unseen > 0 && (
            <button className={`btn btn--sm${showStage ? "" : " btn--accent"}`} onClick={() => setMode(showStage ? "list" : "stage")}>
              {showStage ? "Show the log" : `Catch up · ${unseen} new`}
            </button>
          )}
          {todayCount > 0 && !showStage && (
            <button className="btn btn--sm" onClick={shareToday} disabled={sharing} aria-label="Share today's playlist">
              <IconShare size={14} /> Share
            </button>
          )}
          {todayCount > 0 && !showStage && (
            <button
              className="btn btn--sm"
              onClick={() => {
                if (playingAll) {
                  setPlayingAll(false);
                  player.pause();
                  return;
                }
                const first = playlist!.sends.find((s) => player.canPlay(s.track));
                if (!first) return toast("No previews in here yet");
                setPlayingAll(true);
                player.play(first.track.id, first.track.previewUrl, metaOf(first.track));
              }}
            >
              {playingAll ? <IconPause size={14} /> : <IconPlay size={14} />} {playingAll ? "Stop" : "Play today"}
            </button>
          )}
        </div>
      </header>

      {playlist === null ? (
        <Loading />
      ) : showStage || count === 0 ? (
        <Reel
          embedded
          onCaughtUp={() => {
            setMode("list");
            setTimeout(load, 700);
          }}
        />
      ) : (
        <>
          {together && todayCount > 0 && (
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

          {todayCount > 0 ? (
            <>
              <SendRows sends={allToday ? rows : rows.slice(0, TODAY_FOLD)} together={together} onOpen={openTrack} onPreview={() => setPlayingAll(false)} />
              {rows.length === 0 && who && <p className="muted pl__none">Nothing from them today.</p>}
              {rows.length > TODAY_FOLD && (
                <div className="pl__fold">
                  <button type="button" className="linkbtn pl__foldbtn" onClick={() => setAllToday((v) => !v)}>
                    {allToday ? `Fewer` : `All ${rows.length} today`}
                  </button>
                </div>
              )}
            </>
          ) : (
            playlist && <p className="muted pl__quiet">Nothing yet today. Play something on Spotify, in Chrome or on your Mac and it lands here.</p>
          )}

          {playlist && days.length > 0 && (
            <section className="earlier" aria-label="Earlier days">
              <div className="earlier__head">
                <span className="caps">Earlier</span>
                <Link href="/days" className="earlier__all">
                  {days.length > RECENT_DAYS ? `All ${days.length} days` : "All days"}
                </Link>
              </div>
              <DayCards
                days={days}
                today={playlist.today}
                crewId={crew.id}
                together={together}
                onOpenTrack={openTrack}
                limit={RECENT_DAYS}
                initialOpen={todayCount === 0 ? days[0].date : null}
              />
            </section>
          )}
        </>
      )}

      {sheet}
    </div>
  );
}
