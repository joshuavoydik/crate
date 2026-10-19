"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { SourceGlyph, MARK } from "./SourceMark";
import { api, CHROME_EXTENSION_ID, sourceName } from "@/lib/client";

const SITES = ["soundcloud", "youtube", "tidal", "deezer", "amazon", "pandora", "apple", "spotify"] as const;

/**
 * Crate in Chrome, on its own page: what it does, the download, and the three steps, with the
 * pairing link that binds the extension to this person's Crate.
 */
export function ChromeView({ appUrl }: { appUrl: string }) {
  const { setAccentTrack, toast } = useStore();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setAccentTrack(null), [setAccentTrack]);
  useEffect(() => {
    api<{ token: string }>("/api/ingest/token")
      .then((r) => setToken(r.token))
      .catch((e) => toast((e as Error).message));
  }, [toast]);

  const base = appUrl.replace(/\/$/, "");
  const download = `${base}/api/chrome/extension`;
  const pair = token ? `chrome-extension://${CHROME_EXTENSION_ID}/pair.html#url=${encodeURIComponent(base)}&token=${encodeURIComponent(token)}` : null;

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
          A small extension tells your Crate what is playing in Chrome, as it plays. Live lights up, and each play lands in your Log and your crews&rsquo;
          playlists. Nothing to switch on, nothing to post. YouTube counts only what YouTube files under music, so a podcast never becomes a play.
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
        <span className="caps">1 · Download</span>
        <p className="muted" style={{ fontSize: 14.5, margin: "6px 0 0" }}>
          Until it is on the Chrome Web Store, it is a folder you add yourself. The link is yours to pass on; nothing in it is secret.
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
            In Chrome, open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong>, top right.
          </li>
          <li>
            Press <strong>Load unpacked</strong> and choose the <code>crate-chrome</code> folder. Crate appears in the list; pin it to the toolbar if you like.
          </li>
        </ol>
      </div>

      <div className="section">
        <span className="caps">3 · Connect it to your Crate</span>
        <p className="muted" style={{ fontSize: 14.5, margin: "6px 0 10px" }}>
          This button opens a page inside the extension and hands it your Crate&rsquo;s address and your key. It has to be pressed in the Chrome that has
          the extension. The extension&rsquo;s toolbar icon then says which Crate it is connected to.
        </p>
        {pair ? (
          <a className="btn btn--primary" href={pair} target="_blank" rel="noreferrer">
            Connect Chrome
          </a>
        ) : (
          <span className="faint">Getting your key…</span>
        )}
        <p className="faint" style={{ fontSize: 13, marginTop: 14 }}>
          Updated the extension? Load the new folder the same way, then press Connect Chrome again. Listening in the Music, Spotify or SoundCloud apps on a Mac
          instead? That is{" "}
          <Link href="/settings" style={{ textDecoration: "underline" }}>
            Crate on your Mac, in Settings
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
