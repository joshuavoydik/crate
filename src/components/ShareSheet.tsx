"use client";

import { useEffect, useState } from "react";
import { useStore } from "./Store";
import { Sheet } from "./Sheet";
import { Mosaic } from "./Collections";

/**
 * Crate's own way of handing a link on, in place of the system's sheet: the link big, Copy, and
 * the few places a link actually goes (Messages, Mail, WhatsApp). The system sheet is offered
 * only on a phone, where it is the native thing.
 */

type Target = { key: string; label: string; href: (url: string, text: string) => string; glyph: React.ReactNode };

const TARGETS: Target[] = [
  {
    key: "messages",
    label: "Messages",
    href: (url, text) => `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`,
    glyph: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
        <path d="M12 4c-4.6 0-8 2.9-8 6.5 0 2 1.1 3.8 2.8 5L6 19.5l4-1.6c.6.1 1.3.2 2 .2 4.6 0 8-2.9 8-6.5S16.6 4 12 4z" />
      </svg>
    ),
  },
  {
    key: "mail",
    label: "Mail",
    href: (url, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
    glyph: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="M4 7l8 6 8-6" />
      </svg>
    ),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    glyph: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5z" />
        <path d="M9.2 8.8c.2-.4.5-.4.8-.4h.4c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .4-.1.6l-.5.6c.6 1.1 1.5 2 2.7 2.6l.6-.6c.2-.2.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.5c0 .3-.1.6-.4.8-.6.5-1.4.6-2.1.4a8 8 0 0 1-4.7-4.7c-.2-.7-.1-1.5.4-2.1z" />
      </svg>
    ),
  },
];

/** The link, Copy, and where it goes. Both share sheets use this. */
export function ShareActions({ url, text, onDone }: { url: string; text: string; onDone?: () => void }) {
  const { toast } = useStore();
  const [copied, setCopied] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    try {
      setTouch(window.matchMedia("(hover: none)").matches);
    } catch {
      /* no matchMedia */
    }
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(url);
    }
  }

  async function system() {
    try {
      await navigator.share({ title: text, url });
      onDone?.();
    } catch {
      /* cancelled */
    }
  }

  return (
    <>
      <button className="invite__link" onClick={copy} type="button" aria-label="Copy the link">
        <span className="invite__url">{url.replace(/^https?:\/\//, "")}</span>
        <span className="invite__copy">{copied ? "Copied" : "Copy"}</span>
      </button>
      <div className="share__grid" role="group" aria-label="Send it with">
        <button className="share__target" onClick={copy} type="button">
          <span className="share__glyph" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <rect x="8" y="8" width="11" height="12" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
          </span>
          Copy link
        </button>
        {TARGETS.map((t) => (
          <a key={t.key} className="share__target" href={t.href(url, text)} target={t.key === "whatsapp" ? "_blank" : undefined} rel="noreferrer" onClick={() => onDone?.()}>
            <span className="share__glyph" aria-hidden>
              {t.glyph}
            </span>
            {t.label}
          </a>
        ))}
        {touch && typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button className="share__target" onClick={system} type="button">
            <span className="share__glyph" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
              </svg>
            </span>
            More…
          </button>
        )}
      </div>
    </>
  );
}

export function ShareSheet() {
  const { share, closeShare } = useStore();
  if (!share) return null;
  return (
    <Sheet open={!!share} onClose={closeShare} label="Share">
      <div className="invite share">
        {share.covers && share.covers.length > 0 && (
          <div className="share__cover" aria-hidden>
            <Mosaic covers={share.covers} />
          </div>
        )}
        {share.subtitle && <div className="caps">{share.subtitle}</div>}
        <h3 className="display invite__title">{share.title}</h3>
        <ShareActions url={share.url} text={`${share.title}${share.subtitle ? ` · ${share.subtitle}` : ""}`} onDone={closeShare} />
        <div className="invite__actions" style={{ marginTop: 14 }}>
          <button className="btn btn--ghost btn--block" onClick={closeShare} type="button">
            Done
          </button>
        </div>
      </div>
    </Sheet>
  );
}
