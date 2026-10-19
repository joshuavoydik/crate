"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useStore } from "./Store";
import { IconPlus, IconChevron, IconUser, IconBell, IconClose } from "./Icons";
import { Confirm } from "./Confirm";
import { api } from "@/lib/client";
import { Avatar } from "./Avatar";
import type { Crew, Me } from "@/lib/types";

export function TopBar({ active }: { active: "reel" | "live" | "log" | "settings" | "crew" }) {
  const { me, crew, setCrewId, openSend, openInvite, refreshMe, toast, setPocket, rail, setRail, liveCount } = useStore();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  /** The crew whose X was tapped; the sheet asks before anything happens. */
  const [leaving, setLeaving] = useState<Crew | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const notices = me.notices ?? [];

  useEffect(() => {
    if (!open && !bell) return;
    const onDoc = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      if (bell && bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setBell(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, bell]);

  // The last notice handled while the feed is open: it closes itself. Opening it empty just says so.
  const hadNotices = useRef(0);
  useEffect(() => {
    if (bell && notices.length === 0 && hadNotices.current > 0) setBell(false);
    hadNotices.current = notices.length;
  }, [bell, notices.length]);

  async function dismiss(id: string) {
    try {
      await api("/api/notices/dismiss", { method: "POST", json: { id } });
      await refreshMe();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  /** Leave a crew; the last one out takes the crew and its playlist along (the API decides). */
  async function leave(c: Crew) {
    setLeaveBusy(true);
    try {
      await api(`/api/crews/${c.id}/membership`, { method: "DELETE" });
      await refreshMe();
      toast(c.members.length > 1 ? `You left ${c.name}` : `${c.name} deleted`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setLeaveBusy(false);
      setLeaving(null);
    }
  }

  async function createCrew() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const r = await api<{ crew: Crew; me: Me }>("/api/crews", { method: "POST", json: { name } });
      await refreshMe();
      setCrewId(r.crew.id);
      setNewName("");
      setOpen(false);
      // A crew of one is a playlist nobody else hears: the invite comes up right away.
      openInvite();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const alone = (c: Crew) => c.members.length <= 1;

  const others = crew ? crew.members.filter((m) => m.id !== me.id) : [];

  return (
    <header className="topbar">
      <div className="topbar__left" ref={ref} style={{ position: "relative" }}>
        <button className="crewname" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
          <span className="avatars" aria-hidden>
            {crew ? (
              <Avatar name={crew.name} url={crew.avatarUrl ?? (others.length === 0 ? me.avatarUrl : (others[0]?.avatarUrl ?? null))} size={24} />
            ) : (
              <Avatar name="?" url={null} size={24} />
            )}
          </span>
          <span className="crewname__text" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
            {crew?.name ?? "No crew"}
          </span>
          <IconChevron />
        </button>
        {open && (
          <div className="pop" role="menu">
            {me.crews.map((c) => (
              <div key={c.id} className="pop__crew">
                <button
                  className={`pop__item${c.id === crew?.id ? " is-on" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    setCrewId(c.id);
                    setOpen(false);
                  }}
                >
                  <span>
                    {c.name}
                    <span className="faint" style={{ marginLeft: 8, fontSize: 12 }}>
                      {c.members.map((m) => m.name.split(" ")[0]).join(", ")}
                    </span>
                  </span>
                  {c.id === crew?.id && <span className="dot" />}
                </button>
                <button
                  className="pop__x"
                  type="button"
                  aria-label={alone(c) ? `Delete ${c.name}` : `Leave ${c.name}`}
                  title={alone(c) ? "Delete this crew" : "Leave this crew"}
                  onClick={() => {
                    setOpen(false);
                    setLeaving(c);
                  }}
                >
                  <IconClose size={14} />
                </button>
              </div>
            ))}
            {crew && (
              <>
                <div className="pop__sep" />
                <button
                  className="pop__item"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    openInvite();
                  }}
                >
                  Invite someone to {crew.name}
                </button>
                <Link className="pop__item" role="menuitem" href="/crew" onClick={() => setOpen(false)}>
                  {crew.name}: people, radio, rules
                </Link>
                <Link className="pop__item" role="menuitem" href="/days" onClick={() => setOpen(false)}>
                  Days: the playlist, date by date
                </Link>
              </>
            )}
            <div className="pop__sep" />
            <form
              className="send__row"
              style={{ padding: "4px 8px 6px" }}
              onSubmit={(e) => {
                e.preventDefault();
                createCrew();
              }}
            >
              <input
                className="field"
                style={{ height: 38, fontSize: 14 }}
                placeholder="New crew name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-label="New crew name"
              />
              <button className="btn btn--sm" type="submit" disabled={creating || !newName.trim()}>
                Start
              </button>
            </form>
          </div>
        )}
      </div>

      <nav className="wordmarks" aria-label="Sections">
        <Link href="/" className={`wordmark${active === "reel" ? " is-active" : ""}`}>
          Playlist
        </Link>
        <Link href="/live" className={`wordmark${active === "live" ? " is-active" : ""}`}>
          Live
          {liveCount > 0 && <i className="beacon beacon--nav" aria-label={`${liveCount} playing`} />}
        </Link>
        <Link href="/log" className={`wordmark${active === "log" ? " is-active" : ""}`}>
          Log
        </Link>
      </nav>

      <div className="topbar__right">
        <button className="iconbtn topbar__pocket" onClick={() => setPocket(true)} aria-label="Pocket mode" data-tip="Pocket">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="6" y="2.5" width="12" height="19" rx="3" />
            <rect x="8.5" y="5" width="7" height="5" rx="1" />
            <circle cx="12" cy="15.5" r="3" />
          </svg>
        </button>
        <button
          className={`iconbtn topbar__rail${rail ? " is-on" : ""}`}
          onClick={() => setRail(!rail)}
          aria-label={rail ? "Hide friends" : "Show friends"}
          aria-pressed={rail}
          data-tip={rail ? "Hide friends" : "Friends"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <circle cx="9" cy="8.5" r="3.2" />
            <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
            <circle cx="17" cy="9.5" r="2.4" />
            <path d="M15.5 14.4c2.6.2 4.4 1.9 5 4.6" />
          </svg>
        </button>
        <div className="bell" ref={bellRef}>
          <button
            className={`iconbtn topbar__bell${notices.length ? " has-notices" : ""}`}
            onClick={() => setBell((b) => !b)}
            aria-label={notices.length ? `${notices.length} ${notices.length === 1 ? "notice" : "notices"}` : "Notices"}
            aria-haspopup="dialog"
            aria-expanded={bell}
            data-tip={notices.length ? `${notices.length} ${notices.length === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}
          >
            <IconBell />
            {notices.length > 0 && <span className="bell__badge num">{notices.length}</span>}
          </button>
          {bell && (
            <div className="pop pop--right notices" role="dialog" aria-label="Notices">
              {notices.length === 0 ? (
                <p className="notices__empty">Nothing needs you.</p>
              ) : (
                notices.map((n) => (
                  <div key={n.id} className="notice">
                    <div className="notice__text">
                      <div className="notice__title">{n.title}</div>
                      {n.body && <div className="notice__body">{n.body}</div>}
                    </div>
                    <div className="notice__actions">
                      {n.action &&
                        (n.action.href.startsWith("/api/") || !n.action.href.startsWith("/") ? (
                          <a className="btn btn--sm btn--primary" href={n.action.href}>
                            {n.action.label}
                          </a>
                        ) : (
                          <Link className="btn btn--sm btn--primary" href={n.action.href} onClick={() => setBell(false)}>
                            {n.action.label}
                          </Link>
                        ))}
                      <button className="iconbtn iconbtn--sm notice__dismiss" onClick={() => dismiss(n.id)} aria-label="Dismiss" title="Dismiss">
                        <IconClose size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <Link
          href="/settings"
          className={`iconbtn${active === "settings" ? " iconbtn--accent" : ""}${me.avatarUrl ? " iconbtn--photo" : ""}`}
          aria-label="You and settings"
          data-tip="You"
        >
          {me.avatarUrl ? <Avatar name={me.name} url={me.avatarUrl} size={36} /> : <IconUser />}
        </Link>
        <button className="iconbtn iconbtn--accent topbar__send" onClick={() => openSend()} aria-label="Send a track" data-tip="Send a track · ⌘K">
          <IconPlus />
        </button>
      </div>

      <Confirm
        open={!!leaving}
        title={leaving ? (alone(leaving) ? `Delete ${leaving.name}?` : `Leave ${leaving.name}?`) : ""}
        body={
          leaving && !alone(leaving)
            ? "The others keep the crew and everything in it. Your kept tracks stay in your log."
            : "You are the only member, so the crew and its playlist go with it. Your kept tracks stay in your log."
        }
        confirmLabel={leaving && !alone(leaving) ? "Leave" : "Delete"}
        busy={leaveBusy}
        onClose={() => setLeaving(null)}
        onConfirm={() => leaving && leave(leaving)}
      />
    </header>
  );
}
