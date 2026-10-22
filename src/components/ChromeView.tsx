"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { SourceGlyph, MARK } from "./SourceMark";
import { api, sourceName, timeAgo } from "@/lib/client";

const SITES = ["soundcloud", "youtube", "tidal", "deezer", "amazon", "pandora", "apple", "spotify"] as const;

/**
 * Crate in Chrome, on its own page: what it does, the download, the steps. The pairing is the
 * page itself: with the extension loaded, its script finds this person's key here and takes it,
 * and the page says Connected. No extension id, no special link.
 */
export function ChromeView({ appUrl }: { appUrl: string }) {
  const { setAccentTrack, toast } = useStore();
  const [token, setToken] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);
  const [heard, setHeard] = useState<{ seenAt: number | null; last: { source?: string; title?: string; artist?: string } | null } | null>(null);
  const pairRef = useRef<HTMLDivElement>(null);

  // What the extension last told this Crate, and when: proof it is alive, or the first place to look.
  useEffect(() => {
    let stop = false;
    const load = () =>
      api<{ seenAt: number | null; last: { source?: string; title?: string; artist?: string } | null }>("/api/chrome/status")
        .then((r) => {
          if (!stop) setHeard(r);
        })
        .catch(() => undefined);
    load();
    const id = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  useEffect(() => setAccentTrack(null), [setAccentTrack]);
  useEffect(() => {
    api<{ token: string }>("/api/ingest/token")
      .then((r) => setToken(r.token))
      .catch((e) => toast((e as Error).message));
  }, [toast]);

  // The extension marks the pairing element once it has taken the key.
  useEffect(() => {
    const el = pairRef.current;
    if (!el) return;
    const check = () => setPaired(el.getAttribute("data-crate-paired") === "1");
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { attributes: true, attributeFilter: ["data-crate-paired"] });
    return () => mo.disconnect();
  }, [token]);

  const base = appUrl.replace(/\/$/, "");
  const download = `${base}/api/chrome/extension`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link copied");
    } catch {
      toast(text);
    }
  }

  return (
    <div className="page settings">
      <div className="page__head" style={{ display: "block" }}>
        <span className="caps">Crate in Chrome</span>
        <h1 className="display page__title">What plays in your browser, on Live.</h1>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 16, maxWidth: 620 }}>
          A small extension tells your Crate what is playing in Chrome, as it plays. Live lights up, and each play lands in your history and your crews&rsquo;
          logs. Nothing to switch on, nothing to post. YouTube counts only what YouTube files under music, so a podcast never becomes a play.
        </p>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 14.5, maxWidth: 620 }}>
          It needs Chrome on a computer; phones do not take extensions. From a phone,{" "}
          <Link href="/settings" style={{ textDecoration: "underline" }}>
            connect Spotify in Settings
          </Link>{" "}
          and your plays arrive a few minutes later.
        </p>
        <div className="chrome__sites" aria-label="Sites it follows">
          {SITES.map((k) => (
            <span key={k} className="chrome__site">
              <span className="srcmark" style={{ width: 22, height: 22, background: MARK[k].bg }} aria-hidden>
                <SourceGlyph kind={k} size={22} />
              </span>
              {k === "youtube" ? "YouTube & YouTube Music" : k === "apple" || k === "spotify" ? `${sourceName(k)} on the web` : sourceName(k)}
            </span>
          ))}
        </div>
      </div>

      <div className="section">
        <div className={`chrome__status${paired ? " is-on" : ""}`} role="status" ref={pairRef} data-crate-pair={token ?? undefined} data-crate-url={base}>
          <i className="chrome__dot" aria-hidden />
          {paired ? (
            <span>
              <strong>Connected.</strong> This Chrome reports to {base.replace(/^https?:\/\//, "")}. Play something on SoundCloud or YouTube and watch Live.
            </span>
          ) : (
            <span>
              <strong>Not connected yet in this Chrome.</strong> Do the steps below in this browser; this line turns green on its own.
            </span>
          )}
        </div>
        {heard && (
          <p className="faint" style={{ fontSize: 13, margin: "10px 2px 0" }}>
            {heard.seenAt
              ? `Last heard from Chrome ${timeAgo(heard.seenAt)}${
                  heard.last?.title ? ` · ${sourceName(heard.last.source ?? "web")}: ${heard.last.title}${heard.last.artist ? ` by ${heard.last.artist}` : ""}` : " · nothing playing"
                }`
              : "Nothing from Chrome yet. Once it is connected, play something on SoundCloud or YouTube; a tab that was already open when you added the extension may need one reload."}
          </p>
        )}
      </div>

      <div className="section">
        <span className="caps">1 · Download</span>
        <p className="muted" style={{ fontSize: 14.5, margin: "6px 0 0" }}>
          Until it is on the Chrome Web Store, it is a folder you add yourself. This download is built for this Crate; a copy from somewhere else will not pair.
        </p>
        <div className="chrome__hero">
          <a className="btn btn--primary" href="/api/chrome/extension" download>
            Download the extension
          </a>
          <button className="btn btn--ghost btn--sm" onClick={() => copy(download)} type="button">
            Copy the link
          </button>
          <code className="faint" style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>
            {download}
          </code>
        </div>
      </div>

      <div className="section">
        <span className="caps">2 · Add it to Chrome</span>
        <ol className="steps">
          <li>Unzip the download. Keep the <code>crate-chrome</code> folder somewhere it can stay; Chrome reads it from there.</li>
          <li>
            In Chrome, open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong>, top right. If an older Crate is listed, remove it.
          </li>
          <li>
            Press <strong>Load unpacked</strong> and choose the <code>crate-chrome</code> folder. Crate appears in the list; pin it to the toolbar if you like.
          </li>
        </ol>
      </div>

      <div className="section">
        <span className="caps">3 · Come back here</span>
        <p className="muted" style={{ fontSize: 14.5, margin: "6px 0 0" }}>
          That is it. Reload this page and the line at the top says Connected: the extension reads your key from this page, signed in as you. The toolbar
          icon shows which Crate it is connected to.
        </p>
        <p className="faint" style={{ fontSize: 13, marginTop: 14 }}>
          Updated the extension? Load the new folder the same way and come back here. Listening in the Music, Spotify or SoundCloud apps on a Mac instead?
          That is{" "}
          <Link href="/settings#mac" style={{ textDecoration: "underline" }}>
            Crate on your Mac, in Settings
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/**
 * The card on the profile page: Crate in Chrome, impossible to miss. Grey until the extension
 * reports, then green with what it last heard. One button either way.
 */
export function ChromeCard() {
  const [heard, setHeard] = useState<{ seenAt: number | null; last: { source?: string; title?: string; artist?: string } | null } | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      api<{ seenAt: number | null; last: { source?: string; title?: string; artist?: string } | null }>("/api/chrome/status")
        .then((r) => {
          if (!stop) setHeard(r);
        })
        .catch(() => undefined);
    load();
    const id = setInterval(load, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  const seen = heard?.seenAt ?? null;
  const alive = !!seen && Date.now() - seen < 2 * 60 * 1000;
  const last = heard?.last;
  return (
    <section className={`chromecard${alive ? " is-on" : ""}`} aria-label="Crate in Chrome">
      <div className="chromecard__text">
        <div className="caps chromecard__status">
          <i className="chrome__dot" aria-hidden />
          {alive
            ? `Crate in Chrome · reporting${last?.title ? ` · ${sourceName(last.source ?? "web")}: ${last.title}${last.artist ? ` by ${last.artist}` : ""}` : ""}`
            : seen
              ? `Crate in Chrome · last heard ${timeAgo(seen)}`
              : "Crate in Chrome · not set up"}
        </div>
        <h2 className="display chromecard__title">{alive ? "Chrome is on Live." : "Put your browser on Live."}</h2>
        <p className="muted chromecard__lede">
          {alive
            ? "Whatever plays in Chrome shows up on Live as it plays and lands in the log. Nothing more to do."
            : "A small extension tells Crate what plays in Chrome: SoundCloud, YouTube, YouTube Music and most music sites. Two minutes, once, and Live follows you."}
        </p>
      </div>
      <Link href="/chrome" className={`btn ${alive ? "btn--ghost" : "btn--primary"}`}>
        {alive ? "Open" : "Set up Crate in Chrome"}
      </Link>
    </section>
  );
}
