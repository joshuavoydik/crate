"use client";

import Link from "next/link";
import { useStore } from "./Store";
import { Avatar, artFallback } from "./Avatar";
import { useLive } from "./LiveView";
import { timeAgo, sourceName } from "@/lib/client";

/**
 * The friends rail: who in the crew is playing what, on the right of every page on wide screens.
 * Live people first with a pulsing dot; everyone else with the last thing they had on.
 */
export function FriendsRail() {
  const { me, crew, rail, openInvite } = useStore();
  const { data } = useLive(rail && crew ? crew.id : null, 20000);
  if (!rail || !crew) return null;
  const people = (data?.people ?? []).filter((p) => p.person.id !== me.id);
  const liveCount = people.filter((p) => p.live).length;
  const others = crew.members.filter((m) => m.id !== me.id);

  return (
    <aside className="rail" aria-label="Friends">
      <div className="rail__head">
        <span className="caps">Friends</span>
        <span className="caps rail__count">
          {liveCount ? (
            <>
              <i className="live__dot" /> {liveCount} live
            </>
          ) : others.length ? (
            `${others.length}`
          ) : (
            ""
          )}
        </span>
      </div>
      {others.length === 0 ? (
        <div className="rail__empty">
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            Nobody here but you. Bring someone in and what they play shows up here as they play it.
          </p>
          <button className="btn btn--sm btn--primary" style={{ marginTop: 12 }} onClick={openInvite} type="button">
            Invite someone
          </button>
        </div>
      ) : (
        <ul className="rail__list">
          {(people.length
            ? people
            : others.map((m) => ({ person: m, live: false, title: null, artist: null, artworkUrl: null, updatedAt: null, source: null }))
          ).map((p) => (
            <li key={p.person.id}>
              <Link
                href="/live"
                className={`rail__row${p.live ? " is-live" : ""}`}
                style={{ "--orb-accent": (p as { track?: { accent?: string | null } }).track?.accent ?? "var(--accent)" } as React.CSSProperties}
              >
                <span className="rail__avatar">
                  <Avatar name={p.person.name} url={p.person.avatarUrl} size={36} live={p.live} />
                  {p.live && <i className="rail__pulse" aria-hidden />}
                </span>
                <span className="rail__text">
                  <span className="rail__name">
                    {p.person.name.split(" ")[0]}
                    <span className="rail__when">{p.live ? "now" : p.updatedAt ? timeAgo(p.updatedAt) : ""}</span>
                  </span>
                  {p.title ? (
                    <>
                      <span className="rail__title">{p.title}</span>
                      <span className="rail__sub">
                        {p.artist}
                        {p.live && p.source && p.source !== "none" ? ` · ${p.source === "crate" ? "in Crate" : sourceName(p.source)}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="rail__sub">Quiet</span>
                  )}
                </span>
                {p.artworkUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="rail__art" src={p.artworkUrl} alt="" onError={artFallback} />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
