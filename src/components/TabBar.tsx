"use client";

import Link from "next/link";
import { useStore } from "./Store";
import { IconPlus } from "./Icons";

const IconReel = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
    <rect x="5" y="3" width="14" height="18" rx="4" />
    <path d="M9 9l6 3-6 3z" fill="currentColor" stroke="none" />
  </svg>
);
const IconLive = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <path d="M12 6.2a5.8 5.8 0 0 1 5.8 5.8" strokeLinecap="round" />
  </svg>
);
const IconLog = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <path d="M5 6h14M5 12h14M5 18h9" />
  </svg>
);

/** Mobile navigation: thumbs reach the bottom, not the top. */
export function TabBar({ active }: { active: "reel" | "live" | "log" | "settings" | "crew" }) {
  const { openSend, liveCount } = useStore();
  return (
    <nav className="tabbar" aria-label="Sections">
      <Link href="/live" className={`tab${active === "live" ? " is-active" : ""}`}>
        <IconLive />
        {liveCount > 0 && <i className="beacon beacon--tab" aria-label={`${liveCount} playing`} />}
        Live
      </Link>
      <Link href="/" className={`tab${active === "reel" ? " is-active" : ""}`}>
        <IconReel />
        Playlist
      </Link>
      <Link href="/log" className={`tab${active === "log" ? " is-active" : ""}`}>
        <IconLog />
        Log
      </Link>
      <button className="tab tab--send" onClick={() => openSend()} aria-label="Send a track">
        <span className="tab__icon">
          <IconPlus />
        </span>
        Send
      </button>
    </nav>
  );
}
