"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useStore } from "./Store";
import { Connections } from "./Connections";

/** First run: connect where you listen, or skip. */
export function ConnectView() {
  const { me, setAccentTrack } = useStore();
  useEffect(() => setAccentTrack(null), [setAccentTrack]);
  const any = Object.values(me.connectors).some(Boolean);
  return (
    <div className="page connect-page">
      <div className="page__head" style={{ display: "block" }}>
        <h1 className="display page__title">Where do you listen?</h1>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 16 }}>
          Connect once. What you play and like shows up on its own.
        </p>
      </div>
      {any ? (
        <Connections showUnavailable={false} />
      ) : (
        <p className="muted" style={{ fontSize: 15 }}>
          No services are connected to this Crate yet. Whoever runs it does a one-time registration at{" "}
          <Link href="/setup" style={{ textDecoration: "underline" }}>
            setup
          </Link>
          ; after that everyone just taps Connect.
        </p>
      )}
      <p className="muted" style={{ fontSize: 14.5, marginTop: 22 }}>
        Listening in the browser, or in the Music app on a Mac?{" "}
        <Link href="/chrome" style={{ textDecoration: "underline" }}>
          Crate in Chrome
        </Link>{" "}
        follows SoundCloud, YouTube and the rest as they play;{" "}
        <Link href="/settings" style={{ textDecoration: "underline" }}>
          Crate on your Mac
        </Link>{" "}
        does the same for the apps. Both are in Settings whenever you want them.
      </p>
      <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
        <Link href="/" className="btn btn--primary">
          {me.sources.length ? "Done" : "Skip for now"}
        </Link>
      </div>
    </div>
  );
}
