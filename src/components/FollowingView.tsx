"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Orb, useNow, History } from "./LiveView";
import { metaOf, api } from "@/lib/client";
import type { LivePerson, LiveSession } from "@/lib/live";

type Feed = { people: Array<LivePerson & { handle: string; level: string }>; plays: LiveSession[]; now: number };

/**
 * The people you follow: not your crew, just taste you keep up with. Who is playing right now, and
 * what they have played lately, from those who show their plays.
 */
export function FollowingView() {
  const { setAccentTrack } = useStore();
  const player = usePlayer();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [skew, setSkew] = useState(0);
  const now = useNow() - skew;

  const load = useCallback(async () => {
    try {
      const r = await api<Feed>("/api/following");
      setSkew(Date.now() - r.now);
      setFeed(r);
    } catch {
      /* offline */
    }
  }, []);
  useEffect(() => {
    setAccentTrack(null);
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => clearInterval(id);
  }, [load, setAccentTrack]);

  const people = feed?.people ?? [];
  const liveCount = people.filter((p) => p.live).length;
  return (
    <div className="page following">
      <div className="page__head">
        <div>
          <Link href="/live" className="caps pl__back">
            Live
          </Link>
          <h1 className="display page__title">Following</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            {feed ? (people.length === 0 ? "Nobody yet." : `${people.length} ${people.length === 1 ? "person" : "people"}${liveCount ? ` · ${liveCount} playing now` : ""}`) : "…"}
          </div>
        </div>
      </div>

      {feed && people.length === 0 && (
        <p className="muted" style={{ maxWidth: "52ch" }}>
          When someone posts their Crate link, open it and press Follow. They show up here, and on Live under your crew when they are playing. No invite,
          no crew; just their taste, as they share it.
        </p>
      )}

      {people.length > 0 && (
        <div className="live__grid" aria-live="polite">
          {people.map((p) => (
            <div key={p.person.id} className="follow">
              <Orb p={p} now={now} isMe={false} onOpen={() => p.track?.previewUrl && player.play(p.track.id, p.track.previewUrl, metaOf(p.track))} />
              <Link href={`/u/${p.handle}`} className="follow__handle caps">
                @{p.handle}
              </Link>
            </div>
          ))}
        </div>
      )}

      {feed && feed.plays.length > 0 && (
        <History sessions={feed.plays} meId={null} onPlay={(t) => t.previewUrl && player.play(t.id, t.previewUrl, metaOf(t))} playingId={player.playing ? player.currentId : null} title="Lately" />
      )}
    </div>
  );
}
