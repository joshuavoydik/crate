"use client";

import { useCallback, useEffect, useState } from "react";
import { PlayerProvider, usePlayer } from "./Player";
import { Avatar, artFallback } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { IconPlay, IconPause } from "./Icons";
import { api, timeAgo } from "@/lib/client";
import { openable } from "@/lib/resolve/links";
import type { Track } from "@/lib/types";

type Feed = {
  playlist: { name: string; crewName: string; count: number; createdAt: number };
  tracks: Array<{ track: Track; addedBy: { name: string; avatarUrl: string | null }; addedAt: number }>;
};

/** A playlist as a page anyone can open: the list, thirty-second previews, a way to each song where it lives. */
export function PublicPlaylistView({ code, name, crewName }: { code: string; name: string; crewName: string }) {
  return (
    <PlayerProvider>
      <Page code={code} name={name} crewName={crewName} />
    </PlayerProvider>
  );
}

function Page({ code, name, crewName }: { code: string; name: string; crewName: string }) {
  const player = usePlayer();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const load = useCallback(async () => {
    try {
      setFeed(await api<Feed>(`/api/p/${encodeURIComponent(code)}`));
    } catch {
      /* offline */
    }
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);

  const tracks = feed?.tracks ?? [];
  const current = tracks.find((t) => t.track.id === player.currentId)?.track ?? tracks[0]?.track ?? null;
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", current?.accent ?? "#c8b89a");
  }, [current?.accent]);

  // Play all: when a preview ends, the next one with a preview starts.
  useEffect(() => {
    if (!playingAll || !feed || player.playing || player.progress < 1) return;
    const i = tracks.findIndex((t) => t.track.id === player.currentId);
    const next = tracks.slice(i + 1).find((t) => t.track.previewUrl);
    if (next) player.play(next.track.id, next.track.previewUrl);
    else setPlayingAll(false);
  }, [playingAll, player.playing, player.progress, player.currentId, feed, tracks, player]);

  const playable = tracks.some((t) => t.track.previewUrl);

  return (
    <div className="radio">
      <div className="glow" style={{ top: "-20%", right: "-10%" }} />
      <header className="radio__top">
        <div>
          <span className="caps live__status">A playlist from {crewName}</span>
          <h1 className="display radio__name">{feed?.playlist.name ?? name}</h1>
          <div className="muted">
            {feed ? (feed.playlist.count === 1 ? "1 track" : `${feed.playlist.count} tracks`) : "…"}
            {feed ? ` · ${timeAgo(feed.playlist.createdAt)}` : ""}
          </div>
          {playable && (
            <button
              className="btn btn--sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                if (playingAll) {
                  setPlayingAll(false);
                  player.pause();
                  return;
                }
                const first = tracks.find((t) => t.track.previewUrl)!;
                setPlayingAll(true);
                player.play(first.track.id, first.track.previewUrl);
              }}
            >
              {playingAll ? <IconPause size={14} /> : <IconPlay size={14} />} {playingAll ? "Stop" : "Play all"}
            </button>
          )}
        </div>
        <ThemeToggle />
      </header>

      <section className="radio__list" aria-label="The playlist">
        <ul className="pl__list">
          {tracks.map((t) => {
            const isCur = player.currentId === t.track.id;
            const k = openable(t.track.links, "spotify").direct[0];
            const url = k ? t.track.links[k]!.url : null;
            return (
              <li
                key={t.track.id}
                className={`pl__row${isCur && player.playing ? " is-playing" : ""}`}
                onClick={() => {
                  if (!t.track.previewUrl) return;
                  setPlayingAll(false);
                  player.play(t.track.id, t.track.previewUrl);
                }}
              >
                <div className="log__artwrap">
                  {t.track.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="row__art" src={t.track.artworkUrl} alt="" onError={artFallback} />
                  ) : (
                    <div className="row__art" />
                  )}
                  {t.track.previewUrl && (
                    <span className="log__play" aria-hidden>
                      {isCur && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                    </span>
                  )}
                </div>
                <div className="pl__main">
                  <div className="row__title pl__title">{t.track.title}</div>
                  <div className="row__sub pl__sub">{t.track.artist}</div>
                </div>
                <div className="pl__meta">
                  <span className="pl__from">
                    <Avatar name={t.addedBy.name} url={t.addedBy.avatarUrl} size={20} />
                    <span>{t.addedBy.name.split(" ")[0]}</span>
                  </span>
                  <span className="pl__when num">{timeAgo(t.addedAt)}</span>
                  {url && (
                    <a className="btn btn--sm btn--ghost" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      Open
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {feed && tracks.length === 0 && <p className="muted">Nothing in here yet.</p>}
      </section>
      <footer className="radio__foot faint">
        Made in Crate, where friends trade music. Previews are thirty seconds; the full songs live where they always did.{" "}
        <a href="/" style={{ textDecoration: "underline" }}>
          Start your own crew
        </a>
        .
      </footer>
    </div>
  );
}
