"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "./Store";
import { Connections } from "./Connections";

const MacGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 19h20" />
  </svg>
);
const ChromeGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.5v5.3M5 16l4.3-2.6M19 16l-4.3-2.6" strokeLinecap="round" />
  </svg>
);

/**
 * The two ways plays reach Crate as they happen. Both need a computer; the rows say so, and
 * each one goes to its own setup (the Mac fold in Settings, the Crate in Chrome page).
 */
export function LivePathRows() {
  const rows = [
    { href: "/settings#mac", glyph: <MacGlyph />, name: "Crate on your Mac", sub: "The Music, Spotify and SoundCloud apps, as they play. One download; needs a Mac." },
    { href: "/chrome", glyph: <ChromeGlyph />, name: "Crate in Chrome", sub: "SoundCloud, YouTube and most music sites, as they play. Needs Chrome on a computer." },
  ];
  return (
    <div>
      {rows.map((r) => (
        <Link key={r.href} href={r.href} className="conn" style={{ color: "inherit", textDecoration: "none" }}>
          <span className="conn__mark" style={{ background: "var(--ink)", color: "var(--surface)" }} aria-hidden>
            {r.glyph}
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="conn__name" style={{ display: "block" }}>
              {r.name}
            </span>
            <span className="conn__sub" style={{ display: "block" }}>
              {r.sub}
            </span>
          </span>
          <span className="conn__cta">Set up</span>
        </Link>
      ))}
    </div>
  );
}

/** One honest line about what a phone can and cannot do, for every place the computer paths are offered. */
export function PhoneNote({ style }: { style?: React.CSSProperties }) {
  return (
    <p className="muted" style={{ fontSize: 14, ...style }}>
      On a phone, connect Spotify: your plays arrive a few minutes later, Live included. Crate on your Mac needs a Mac, Crate in Chrome needs Chrome on a
      computer, and a YouTube or SoundCloud account brings likes, not plays.
    </p>
  );
}

/**
 * First run: where plays come from. On a computer the two live paths lead, then the accounts; on a
 * phone, where neither live path can be followed, the accounts lead and the live paths come after.
 */
export function ConnectView() {
  const { me, setAccentTrack } = useStore();
  const router = useRouter();
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    setAccentTrack(null);
    setPhone(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, [setAccentTrack]);
  const any = Object.values(me.connectors).some(Boolean);

  const live = (
    <section key="live">
      <div className="caps" style={{ margin: phone ? "26px 0 4px" : "0 0 4px" }}>
        {phone ? "Live, as you play, from a computer" : "Live, as you play"}
      </div>
      <LivePathRows />
    </section>
  );
  const accounts = (
    <section key="accounts">
      <div className="caps" style={{ margin: phone ? "0 0 4px" : "26px 0 4px" }}>
        Accounts
      </div>
      <Connections showUnavailable={false} onMac={() => router.push("/settings#mac")} />
      {!any && (
        <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>
          No accounts are switched on in this Crate yet; whoever runs it can turn them on. The two live paths work either way.
        </p>
      )}
    </section>
  );

  return (
    <div className="page connect-page">
      <div className="page__head" style={{ display: "block" }}>
        <h1 className="display page__title">Where do you listen?</h1>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 16 }}>
          Set this up once. What you play lands in the crew&apos;s playlist on its own, and the crew sees it on Live as you play it.
        </p>
      </div>

      {phone ? <PhoneNote style={{ margin: "-4px 0 20px" }} /> : null}
      {phone ? [accounts, live] : [live, accounts]}
      {phone ? null : <PhoneNote style={{ marginTop: 22 }} />}
      <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
        <Link href="/" className="btn btn--primary">
          {me.sources.length ? "Done" : "Skip for now"}
        </Link>
      </div>
    </div>
  );
}
