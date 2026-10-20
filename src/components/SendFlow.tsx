"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { IconPlay, IconPause } from "./Icons";
import { api } from "@/lib/client";
import { extractUrl } from "@/lib/resolve/parse";
import type { Track, Send, Collection } from "@/lib/types";

type SearchHit = {
  appleId: string;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  year: number | null;
};
type Resolved = { track: Track; resolved: boolean; sourceUrl: string; suggestedNote: string };

/**
 * The send: you, on purpose, putting one track in front of the crew with a line. The playlist fills
 * itself from what everyone plays; this is the opposite, and it lands as new at the top of their
 * playlist to keep, skip or answer. It can go into one of the crew's hand-made playlists on the way.
 */
export function SendFlow() {
  const { sendOpen, sendPrefill, closeSend, me, crew, toast, bumpSends, openInvite, collectionsVersion, bumpCollections } = useStore();
  const player = usePlayer();
  const [text, setText] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [step, setStep] = useState<"input" | "resolving" | "ready">("input");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [note, setNote] = useState("");
  const [crewId, setCrewId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [into, setInto] = useState<Set<string>>(new Set());
  /** On a phone the clipboard needs a tap to be read, so a Paste button earns its place; with a keyboard, ⌘V does. */
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    try {
      setTouch(window.matchMedia("(hover: none)").matches);
    } catch {
      /* no matchMedia */
    }
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const target = me.crews.find((c) => c.id === crewId) ?? crew;
  const recipients = target ? target.members.filter((m) => m.id !== me.id) : [];
  const recipientIsDj = recipients.some((m) => m.isDj);
  const names = recipients.map((m) => m.name.split(" ")[0]).join(" and ");

  const reset = useCallback(() => {
    setText("");
    setHits([]);
    setStep("input");
    setResolved(null);
    setNote("");
    setErr(null);
    setSending(false);
    setInto(new Set());
  }, []);

  // The crew's playlists, for the "also keep it in" chips: fetched when the sheet opens and again
  // when a track is ready, so a playlist made meanwhile is there to pick.
  const targetId = target?.id ?? null;
  useEffect(() => {
    if (!sendOpen || !targetId || step === "resolving") return;
    let stop = false;
    api<{ collections: Collection[] }>(`/api/collections?crew=${encodeURIComponent(targetId)}`)
      .then((r) => {
        if (!stop) setCollections(r.collections);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [sendOpen, targetId, collectionsVersion, step]);

  useEffect(() => {
    if (!sendOpen) {
      reset();
      return;
    }
    setCrewId(crew?.id ?? null);
    if (sendPrefill) {
      setText(sendPrefill);
      void resolve({ url: sendPrefill });
    } else {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendOpen, sendPrefill]);

  async function resolve(input: { url?: string; appleId?: string }) {
    const my = ++seq.current;
    setStep("resolving");
    setErr(null);
    try {
      const r = await api<Resolved>("/api/resolve", { method: "POST", json: { ...input, recipientIsDj } });
      if (my !== seq.current) return;
      setResolved(r);
      setStep("ready");
    } catch (e) {
      if (my !== seq.current) return;
      setErr((e as Error).message);
      setStep("input");
    }
  }

  // Typing: a link resolves, words search the catalog.
  useEffect(() => {
    if (!sendOpen || step !== "input") return;
    const url = extractUrl(text);
    if (url) {
      const t = setTimeout(() => resolve({ url }), 250);
      return () => clearTimeout(t);
    }
    const q = text.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
        if (my === seq.current) setHits(r.results);
      } catch {
        /* ignore */
      }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, sendOpen, step]);

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
      else toast("Clipboard is empty");
    } catch {
      toast("Paste into the field instead");
      inputRef.current?.focus();
    }
  }

  async function send() {
    if (!resolved || !target) return;
    setSending(true);
    const human = note.trim();
    try {
      const r = await api<{ send: Send }>("/api/sends", {
        method: "POST",
        json: {
          crewId: target.id,
          trackId: resolved.track.id,
          note: human || resolved.suggestedNote,
          noteBy: human ? "human" : "agent",
          sourceUrl: resolved.sourceUrl,
        },
      });
      const chosen = collections.filter((c) => into.has(c.id));
      if (chosen.length) {
        await Promise.all(chosen.map((c) => api(`/api/collections/${c.id}/tracks`, { method: "POST", json: { trackId: resolved.track.id } }).catch(() => undefined)));
        bumpCollections();
      }
      closeSend();
      bumpSends();
      toast(`Sent to ${names || target.name}${chosen.length ? ` · in ${chosen.map((c) => c.name).join(", ")}` : ""}`, {
        label: "Undo",
        run: async () => {
          try {
            await api(`/api/sends/${r.send.id}`, { method: "DELETE" });
            bumpSends();
            toast("Unsent");
          } catch (e) {
            toast((e as Error).message);
          }
        },
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const t = resolved?.track;
  const metaBits = t ? [t.year, t.genre, t.album && t.album !== t.title ? t.album : null].filter(Boolean) : [];

  return (
    <Sheet open={sendOpen} onClose={closeSend} label="Send a track">
      {step !== "ready" && (
        <>
          <div className="caps">Send to {target?.name ?? "your crew"}</div>
          <div className="send__row" style={{ marginTop: 6 }}>
            <input
              ref={inputRef}
              className="field field--lg"
              placeholder="Paste a link or type a song"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="search"
              aria-label="Link or search"
            />
            {!text && touch && (
              <button className="btn btn--sm" onClick={pasteFromClipboard} type="button">
                Paste
              </button>
            )}
          </div>
          {err && (
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              {err}
            </p>
          )}
          {step === "resolving" && (
            <div className="preview" style={{ marginTop: 22 }}>
              <div className="skeleton" style={{ width: 96, height: 96, borderRadius: 16 }} />
              <div>
                <div className="skeleton" style={{ height: 26, width: "70%" }} />
                <div className="skeleton" style={{ height: 16, width: "45%", marginTop: 10 }} />
                <div className="caps" style={{ marginTop: 14 }}>
                  Resolving
                </div>
              </div>
            </div>
          )}
          {step === "input" && hits.length > 0 && (
            <ul className="results">
              {hits.map((h) => (
                <li key={h.appleId}>
                  <div className="result" style={{ cursor: "pointer" }} onClick={() => resolve({ appleId: h.appleId })} role="button" tabIndex={0}>
                    <div style={{ position: "relative" }}>
                      {h.artworkUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="result__art" src={h.artworkUrl.replace("600x600", "120x120")} alt="" />
                      ) : (
                        <div className="result__art" />
                      )}
                      {h.previewUrl && (
                        <button
                          className="iconbtn"
                          style={{
                            position: "absolute",
                            inset: 0,
                            margin: "auto",
                            width: 30,
                            height: 30,
                            background: "rgba(0,0,0,.45)",
                            borderColor: "transparent",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            player.play(`search:${h.appleId}`, h.previewUrl);
                          }}
                          aria-label="Preview"
                        >
                          {player.currentId === `search:${h.appleId}` && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                        </button>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="queue__title">{h.title}</div>
                      <div className="queue__artist">
                        {h.artist}
                        {h.year ? ` · ${h.year}` : ""}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {step === "input" && !text && (
            <div className="send__why">
              {recipients.length ? (
                <p className="muted" style={{ fontSize: 14.5, margin: "18px 0 0" }}>
                  The playlist fills itself from what everyone plays. This is the other thing: you saying <em>hear this</em>. It lands at the top of{" "}
                  {names}&rsquo;s playlist with your line, to keep, skip or answer.
                </p>
              ) : (
                <p className="muted" style={{ fontSize: 14.5, margin: "18px 0 0" }}>
                  Just you in {target?.name ?? "this crew"} for now, so this goes into the playlist and your log. Bring someone in and the next one lands in
                  front of them.{" "}
                  <button
                    className="linkbtn"
                    type="button"
                    onClick={() => {
                      closeSend();
                      openInvite();
                    }}
                  >
                    Invite someone
                  </button>
                </p>
              )}
              <p className="faint" style={{ marginTop: 12, fontSize: 13 }}>
                A Spotify, Apple Music, YouTube, SoundCloud, Bandcamp, Beatport, Tidal or Deezer link, or just a song name. On desktop, paste anywhere or drop
                a link on the page.
              </p>
            </div>
          )}
        </>
      )}

      {step === "ready" && t && (
        <>
          <div className="caps">{resolved?.resolved ? "Ready to send" : "Sending as a bare link"}</div>
          <div className="preview" style={{ marginTop: 14 }}>
            {t.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="preview__art" src={t.artworkUrl} alt="" style={{ ["--accent" as string]: t.accent ?? undefined }} />
            ) : (
              <div className="preview__art" />
            )}
            <div style={{ minWidth: 0 }}>
              <h3 className="display preview__title">{t.title}</h3>
              <div className="muted" style={{ marginTop: 4 }}>
                {t.artist}
              </div>
              {metaBits.length > 0 && (
                <div className="caps" style={{ marginTop: 8 }}>
                  {metaBits.join(" · ")}
                </div>
              )}
              {t.previewUrl && (
                <button className="btn btn--sm btn--ghost" style={{ marginLeft: -14, marginTop: 6 }} onClick={() => player.play(t.id, t.previewUrl)}>
                  {player.currentId === t.id && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                  {player.currentId === t.id && player.playing ? "Pause" : "Preview"}
                </button>
              )}
            </div>
          </div>

          {me.crews.length > 1 && (
            <>
              <span className="label caps">To</span>
              <div className="chips">
                {me.crews.map((c) => (
                  <button key={c.id} className={`chip${c.id === target?.id ? " is-on" : ""}`} onClick={() => setCrewId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <span className="label caps">A line for {recipients.map((m) => m.name.split(" ")[0]).join(" and ") || "them"}</span>
          <textarea
            className="textarea"
            rows={2}
            aria-label={`A line for ${recipients.map((m) => m.name.split(" ")[0]).join(" and ") || "them"}`}
            placeholder={resolved?.suggestedNote}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
            }}
          />
          <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
            Leave it empty and Crate writes the line, marked as Crate&apos;s, not yours.
          </p>

          {collections.length > 0 && (
            <>
              <span className="label caps">Also keep it in</span>
              <div className="chips" role="group" aria-label="Also keep it in">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip${into.has(c.id) ? " is-on" : ""}`}
                    aria-pressed={into.has(c.id)}
                    onClick={() =>
                      setInto((s) => {
                        const n = new Set(s);
                        if (n.has(c.id)) n.delete(c.id);
                        else n.add(c.id);
                        return n;
                      })
                    }
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {err && (
            <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
              {err}
            </p>
          )}
          <div className="send__actions">
            <button
              className="btn btn--ghost"
              onClick={() => {
                setStep("input");
                setResolved(null);
              }}
            >
              Change
            </button>
            <button className="btn btn--primary" onClick={send} disabled={sending || !target}>
              {sending ? "Sending" : "Send"}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
