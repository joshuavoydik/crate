"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlayerProvider, usePlayer } from "./Player";
import { Orb, useNow, History } from "./LiveView";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { Mosaic } from "./Collections";
import { IconShare } from "./Icons";
import { api, metaOf } from "@/lib/client";
import type { Collection } from "@/lib/types";
import type { LivePerson, LiveSession } from "@/lib/live";
import type { Person } from "@/lib/types";

type Feed = {
  person: Person;
  handle: string;
  level: "off" | "playlists" | "plays";
  live: LivePerson | null;
  plays: LiveSession[];
  playlists: Array<Collection & { crewName: string }>;
  followers: number;
  following: boolean;
  self: boolean;
  signedIn: boolean;
  now: number;
};

/**
 * A person's page: the link they post. What they are playing right now, lately, and the playlists
 * they have handed out, to the degree they chose. Anyone can look and hear a preview; anyone with a
 * Crate can follow, which puts this person on their Live page without an invite or a crew.
 */
export function ProfileView({ handle, name }: { handle: string; name: string }) {
  return (
    <PlayerProvider>
      <Page handle={handle} name={name} />
    </PlayerProvider>
  );
}

function Page({ handle, name }: { handle: string; name: string }) {
  const player = usePlayer();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [skew, setSkew] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const now = useNow() - skew;

  const load = useCallback(async () => {
    try {
      const r = await api<Feed>(`/api/u/${encodeURIComponent(handle)}`);
      setSkew(Date.now() - r.now);
      setFeed(r);
    } catch {
      /* offline, or gone */
    }
  }, [handle]);
  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", feed?.live?.track?.accent ?? "#c8b89a");
  }, [feed?.live?.track?.accent]);

  async function toggleFollow() {
    if (!feed || busy) return;
    if (!feed.signedIn) {
      location.assign(`/signin?next=${encodeURIComponent(`/u/${handle}`)}`);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ following: boolean; followers: number }>("/api/follow", { method: feed.following ? "DELETE" : "POST", json: { handle } });
      setFeed((f) => f && { ...f, following: r.following, followers: r.followers });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = `${location.origin}/u/${handle}`;
    const title = `${feed?.person.name ?? name} on Crate`;
    try {
      if (window.matchMedia("(hover: none)").matches && typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      /* cancelled, or not allowed: fall through to copying */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard */
    }
  }

  const first = (feed?.person.name ?? name).split(" ")[0];
  const live = feed?.live;
  const playing = !!live?.live;
  const plays = feed?.plays ?? [];
  const playlists = feed?.playlists ?? [];

  return (
    <div className="radio profile">
      <header className="radio__top">
        <div className="profile__who">
          <Avatar name={feed?.person.name ?? name} url={feed?.person.avatarUrl ?? null} size={56} />
          <div style={{ minWidth: 0 }}>
            <span className="caps live__status">
              {playing ? (
                <>
                  <i className="live__dot" /> Playing now
                </>
              ) : feed?.level === "plays" && live?.updatedAt ? (
                "Quiet right now"
              ) : (
                "On Crate"
              )}
              {feed && feed.followers > 0 ? ` · ${feed.followers} ${feed.followers === 1 ? "follower" : "followers"}` : ""}
            </span>
            <h1 className="display radio__name profile__name">{feed?.person.name ?? name}</h1>
            <div className="muted profile__handle">@{handle}</div>
          </div>
        </div>
        <div className="profile__actions">
          {feed && !feed.self && (
            <button className={`btn btn--sm${feed.following ? "" : " btn--primary"}`} onClick={toggleFollow} disabled={busy} data-testid="follow">
              {feed.following ? "Following" : "Follow"}
            </button>
          )}
          {feed?.self && (
            <Link href="/settings#page" className="btn btn--sm">
              Edit your page
            </Link>
          )}
          <button className="btn btn--sm btn--ghost" onClick={share} aria-label="Share this page">
            <IconShare size={14} /> {copied ? "Copied" : "Share"}
          </button>
          <ThemeToggle />
        </div>
      </header>

      {feed?.self && feed.level === "off" && (
        <p className="muted profile__note" role="status">
          Only you can see this page: it is off. Turn it on in Settings and the link works for anyone.
        </p>
      )}

      {feed?.level === "plays" && live && (
        <section className="live__grid profile__now" aria-label="Playing now">
          <Orb p={live} now={now} isMe={false} onOpen={() => live.track?.previewUrl && player.play(live.track.id, live.track.previewUrl, metaOf(live.track))} />
        </section>
      )}

      {plays.length > 0 && (
        <History sessions={plays} meId={null} onPlay={(t) => t.previewUrl && player.play(t.id, t.previewUrl, metaOf(t))} playingId={player.playing ? player.currentId : null} title="Lately" />
      )}

      {playlists.length > 0 && (
        <section className="radio__list" aria-label="Playlists">
          <div className="caps" style={{ margin: "28px 0 8px" }}>
            Playlists
          </div>
          <div className="mixes">
            {playlists.map((c) => (
              <a key={c.id} href={`/p/${c.publicCode}`} className="mix">
                <Mosaic covers={c.covers} />
                <div className="mix__name">{c.name}</div>
                <div className="mix__n num">
                  {c.count === 1 ? "1 track" : `${c.count} tracks`}
                  {c.day ? " · a day" : ""}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {feed && !playing && plays.length === 0 && playlists.length === 0 && feed.level !== "off" && (
        <p className="muted profile__note">Nothing to show yet. {feed.self ? "Play something, or share a playlist." : `When ${first} plays or shares something, it lands here.`}</p>
      )}

      <footer className="radio__foot faint">
        {feed && !feed.signedIn ? (
          <>
            Crate is music between friends, with memory. Follow {first} to keep up, or{" "}
            <a href="/" style={{ textDecoration: "underline" }}>
              start your own
            </a>
            .
          </>
        ) : (
          <>
            Made in Crate.{" "}
            <Link href="/" style={{ textDecoration: "underline" }}>
              Back to yours
            </Link>
            .
          </>
        )}
      </footer>
    </div>
  );
}
