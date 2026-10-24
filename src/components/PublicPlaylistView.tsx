"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, artFallback } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { Sheet } from "./Sheet";
import { IconPlay, IconPause } from "./Icons";
import { PlayerProvider, usePlayer } from "./Player";
import { api, timeAgo, metaOf } from "@/lib/client";
import type { Track } from "@/lib/types";

type Feed = {
  open?: string;
  playlist: { name: string; crewName: string; count: number; createdAt: number };
  tracks: Array<{ track: Track; addedBy: { name: string; avatarUrl: string | null }; addedAt: number }>;
  signedIn: boolean;
};

/**
 * A playlist as a page anyone can open: the whole list is there to see, who added what and when.
 * Hearing it is the part that needs a name: tap any song and Crate asks for one, makes the person
 * a guest of this playlist, and opens it inside the app with previews and the links to each song.
 */
export function PublicPlaylistView(props: { code: string; name: string; crewName: string; signedIn: boolean }) {
  return (
    <PlayerProvider>
      <PublicPlaylist {...props} />
    </PlayerProvider>
  );
}

function PublicPlaylist({ code, name, crewName, signedIn }: { code: string; name: string; crewName: string; signedIn: boolean }) {
  const player = usePlayer();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [ask, setAsk] = useState<Track | null>(null);
  const [yourName, setYourName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const f = await api<Feed>(`/api/p/${encodeURIComponent(code)}`);
      if (f.open) {
        window.location.assign(f.open);
        return;
      }
      setFeed(f);
    } catch {
      /* offline */
    }
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);

  const tracks = feed?.tracks ?? [];
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", tracks[0]?.track.accent ?? "#c8b89a");
  }, [tracks]);

  /** Come in: an account when there is none yet, a guest pass to this playlist either way, then the app. */
  async function comeIn(track: Track | null) {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ open: string }>(`/api/p/${encodeURIComponent(code)}`, { method: "POST", json: { yourName: yourName.trim() } });
      window.location.assign(track ? `${r.open}?track=${encodeURIComponent(track.id)}` : r.open);
    } catch (e) {
      setProblem((e as Error).message);
      setBusy(false);
    }
  }

  function tap(track: Track | null) {
    // Someone with a Crate account already just comes in; no name to ask for.
    if (feed?.signedIn || signedIn) void comeIn(track);
    else setAsk(track ?? tracks[0]?.track ?? null);
  }

  /** A row: the preview plays right here for anyone; a song with no preview opens the way in. */
  function row(track: Track) {
    if (track.previewUrl) player.play(track.id, track.previewUrl, metaOf(track));
    else tap(track);
  }

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
          {tracks.length > 0 && (
            <button className="btn btn--sm btn--primary" style={{ marginTop: 12 }} onClick={() => tap(null)}>
              <IconPlay size={14} /> Hear it on Crate
            </button>
          )}
        </div>
        <ThemeToggle />
      </header>

      <section className="radio__list" aria-label="The playlist">
        <ul className="pl__list">
          {tracks.map((t) => {
            const isCur = player.currentId === t.track.id && player.playing;
            return (
              <li
                key={t.track.id}
                className={`pl__row${isCur ? " is-playing" : ""}`}
                onClick={() => row(t.track)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && row(t.track)}
              >
                <div className="log__artwrap">
                  {t.track.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="row__art" src={t.track.artworkUrl} alt="" onError={artFallback} />
                  ) : (
                    <div className="row__art" />
                  )}
                  <span className="log__play" aria-hidden>
                    {isCur ? <IconPause size={14} /> : <IconPlay size={14} />}
                  </span>
                </div>
                <div className="pl__main">
                  <div className="row__title pl__title">{t.track.title}</div>
                  <div className="row__sub pl__sub">{t.track.artist}</div>
                </div>
                <div className="pl__meta">
                  <span className="pl__from">
                    <Avatar name={t.addedBy.name} url={t.addedBy.avatarUrl} size={20} />
                    <span>{t.addedBy.name}</span>
                  </span>
                  <span className="pl__when num">{timeAgo(t.addedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {feed && tracks.length === 0 && <p className="muted">Nothing in here yet.</p>}
      </section>
      <footer className="radio__foot faint">
        Made in Crate, where friends trade music. Tap a song for a taste; the whole thing, and where it lives, takes a name and nothing else.{" "}
        <a href="/" style={{ textDecoration: "underline" }}>
          Start your own crew
        </a>
        .
      </footer>

      <Sheet
        open={!!ask}
        onClose={() => {
          if (!busy) setAsk(null);
        }}
        label="Hear it on Crate"
      >
        {ask && (
          <form
            className="comein"
            onSubmit={(e) => {
              e.preventDefault();
              if (yourName.trim()) void comeIn(ask);
            }}
          >
            <div className="comein__track">
              {ask.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="row__art" src={ask.artworkUrl} alt="" onError={artFallback} />
              ) : (
                <div className="row__art" />
              )}
              <div style={{ minWidth: 0 }}>
                <div className="row__title">{ask.title}</div>
                <div className="row__sub">{ask.artist}</div>
              </div>
            </div>
            <h2 className="display comein__title">Hear it on Crate.</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Crate is music between friends, and this playlist is {crewName}&apos;s. Give it your name and it opens for you: every song, a preview of each, and
              the way to it on Spotify, Apple Music or wherever you listen. No password, no email.
            </p>
            <label className="label caps" htmlFor="comein-name">
              Your name
            </label>
            <input
              id="comein-name"
              className="field"
              value={yourName}
              onChange={(e) => setYourName(e.target.value)}
              placeholder="First name is fine"
              maxLength={60}
              autoComplete="name"
              autoCapitalize="words"
              autoFocus
            />
            {problem && (
              <p className="muted" role="alert" style={{ fontSize: 14 }}>
                {problem}
              </p>
            )}
            <div className="stage__actions" style={{ marginTop: 14 }}>
              <button className="btn btn--primary" type="submit" disabled={busy || !yourName.trim()}>
                {busy ? "Opening…" : "Come in and play it"}
              </button>
              <button className="btn btn--ghost" type="button" onClick={() => setAsk(null)} disabled={busy}>
                Not now
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
