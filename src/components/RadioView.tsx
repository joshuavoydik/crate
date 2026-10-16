"use client";

import { useCallback, useEffect, useState } from "react";
import { PlayerProvider, usePlayer } from "./Player";
import { Orb, useNow, History } from "./LiveView";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";
import { IconPlay, IconPause } from "./Icons";
import { api, timeAgo } from "@/lib/client";
import { openable } from "@/lib/resolve/links";
import type { Send } from "@/lib/types";
import type { LivePerson, LiveSession } from "@/lib/live";

type Feed = { crew: { name: string; playlistName: string | null }; people: LivePerson[]; sends: Send[]; history: LiveSession[]; tunedIn: number; now: number };

/** The public station: read-only, no account. Who is playing what, and the playlist. */
export function RadioView({ code, crewName }: { code: string; crewName: string }) {
  return (
    <PlayerProvider>
      <Station code={code} crewName={crewName} />
    </PlayerProvider>
  );
}

function Station({ code, crewName }: { code: string; crewName: string }) {
  const player = usePlayer();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [skew, setSkew] = useState(0);
  const now = useNow() - skew;
  const load = useCallback(async () => {
    try {
      const r = await api<Feed>(`/api/radio/${encodeURIComponent(code)}?v=${viewerKey()}`);
      setSkew(Date.now() - r.now);
      setFeed(r);
    } catch {
      /* offline */
    }
  }, [code]);
  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 10000);
    return () => clearInterval(id);
  }, [load]);

  const lead = feed?.people.find((p) => p.live && p.track) ?? null;
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", lead?.track?.accent ?? "#c8b89a");
  }, [lead?.track?.accent]);

  const liveCount = feed?.people.filter((p) => p.live).length ?? 0;
  const listening = feed?.tunedIn ?? 0;

  return (
    <div className="radio">
      <div className="glow" style={{ top: "-20%", right: "-10%" }} />
      <header className="radio__top">
        <div>
          <span className="caps live__status">
            {liveCount ? (
              <>
                <i className="live__dot" /> On air · {liveCount} playing
              </>
            ) : (
              "Off air, for now"
            )}
            {listening > 1 ? <span className="live__tuned"> · {listening} listening</span> : null}
          </span>
          <h1 className="display radio__name">{feed?.crew.playlistName ?? crewName}</h1>
          <div className="muted">{crewName} on Crate</div>
        </div>
        <ThemeToggle />
      </header>

      <section className="live__grid" aria-label="Playing now">
        {(feed?.people ?? []).map((p) => (
          <Orb key={p.person.id} p={p} now={now} isMe={false} onOpen={() => p.track?.previewUrl && player.play(p.track.id, p.track.previewUrl)} />
        ))}
      </section>

      {feed && feed.history.length > 0 && (
        <History
          sessions={feed.history}
          meId={null}
          onPlay={(t) => t.previewUrl && player.play(t.id, t.previewUrl)}
          playingId={player.playing ? player.currentId : null}
        />
      )}

      <section className="radio__list">
        <div className="caps" style={{ margin: "28px 0 8px" }}>
          The playlist
        </div>
        <ul className="pl__list">
          {(feed?.sends ?? []).map((s) => {
            const isCur = player.currentId === s.track.id;
            return (
              <li
                key={s.id}
                className={`pl__row${isCur && player.playing ? " is-playing" : ""}`}
                onClick={() => s.track.previewUrl && player.play(s.track.id, s.track.previewUrl)}
              >
                <div className="log__artwrap">
                  {s.track.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="row__art" src={s.track.artworkUrl} alt="" />
                  ) : (
                    <div className="row__art" />
                  )}
                  {s.track.previewUrl && (
                    <span className="log__play" aria-hidden>
                      {isCur && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                    </span>
                  )}
                </div>
                <div className="pl__main">
                  <div className="row__title pl__title">{s.track.title}</div>
                  <div className="row__sub pl__sub">
                    {s.track.artist}
                    {s.note ? <span className="pl__note"> · “{s.note}”</span> : null}
                  </div>
                </div>
                <div className="pl__meta">
                  <span className="pl__from">
                    <Avatar name={s.from.name} url={s.from.avatarUrl} size={20} />
                    <span>{s.from.name.split(" ")[0]}</span>
                  </span>
                  <span className="pl__when num">{timeAgo(s.createdAt)}</span>
                  {(() => {
                    const k = openable(s.track.links, "spotify").direct[0];
                    const url = k ? s.track.links[k]!.url : s.sourceUrl;
                    return url ? (
                      <a className="btn btn--sm btn--ghost" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        Open
                      </a>
                    ) : null;
                  })()}
                </div>
              </li>
            );
          })}
        </ul>
        {feed && feed.sends.length === 0 && <p className="muted">Nothing in the playlist yet.</p>}
      </section>
      <footer className="radio__foot faint">A Crate station. Previews are thirty seconds; the full songs live where they always did.</footer>
    </div>
  );
}

/** A stable anonymous id for this browser, so the station can count who is tuned in. */
function viewerKey(): string {
  try {
    let v = localStorage.getItem("crate:viewer");
    if (!v) {
      v = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("crate:viewer", v);
    }
    return v;
  } catch {
    return "anon";
  }
}
