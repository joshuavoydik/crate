"use client";

import { useState } from "react";
import { useStore } from "./Store";
import { IconCheck, IconKeep, IconOut, IconDeck, IconCopy, IconPlus, IconPlay, IconPause } from "./Icons";
import { usePlayer } from "./Player";
import { Comments } from "./Comments";
import { artFallback } from "./Avatar";
import { formatDuration, timeAgo, viaLabel, openOrder, metaOf } from "@/lib/client";
import { openable, PLATFORM_LABELS, BUY_PLATFORMS, type PlatformKey } from "@/lib/resolve/links";
import { api } from "@/lib/client";
import type { Send, Track } from "@/lib/types";

type Candidate = {
  appleId: string;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  year: number | null;
};

/** " on Spotify" from a via such as "played:spotify" or "spotify"; nothing for an ordinary send. */
function whereLabel(via: string): string {
  const v = viaLabel(via);
  return v ? ` ${v.replace(/^(played|liked|loved) /, "")}` : "";
}

export function TrackCard({
  send,
  analyzing,
  onSave,
  onPlayed,
  onReply,
  onTrackChange,
  compact,
}: {
  send: Send;
  analyzing: boolean;
  onSave?: () => void;
  onPlayed?: () => void;
  onReply?: (text: string) => void;
  /** Called when the person swaps the track to another catalog version or artwork. */
  onTrackChange?: (t: Track) => void;
  compact?: boolean;
}) {
  const { me, toast, openAddTo } = useStore();
  const player = usePlayer();
  const [reply, setReply] = useState(send.reaction?.reply ?? "");
  const [fixing, setFixing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  async function startFix() {
    setFixing(true);
    setCandidates(null);
    try {
      const r = await api<{ candidates: Candidate[] }>(`/api/tracks/${encodeURIComponent(send.track.id)}/rematch`);
      setCandidates(r.candidates);
    } catch (e) {
      toast((e as Error).message);
      setFixing(false);
    }
  }

  async function pick(c: Candidate) {
    setPicking(c.appleId);
    try {
      const r = await api<{ track: Track }>(`/api/tracks/${encodeURIComponent(send.track.id)}/rematch`, { method: "POST", json: { appleId: c.appleId } });
      onTrackChange?.(r.track);
      toast("Updated");
      setFixing(false);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPicking(null);
    }
  }
  const t = send.track;
  const { direct, search } = openable(t.links, openOrder(me, send));
  const primaryKey = direct[0] ?? null;
  const primary = primaryKey ? t.links[primaryKey] : null;
  const rest = direct.filter((k) => k !== primaryKey);
  // No catalog match: the link is the only known home of this track, so searches are just searches.
  const onlyHere = !t.appleId && direct.length <= 1;
  const status = send.reaction?.status ?? null;
  const mine = send.from.id === me.id;

  async function copyLink() {
    const url = primary?.url ?? send.sourceUrl ?? "";
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast(url);
    }
  }

  const meta: Array<{ k: string; v: string | null; pending?: boolean }> = [
    { k: "BPM", v: t.bpm ? String(Math.round(t.bpm)) : null, pending: analyzing && !t.bpm },
    { k: "Key", v: t.camelot ? `${t.camelot} · ${t.keyName ?? ""}`.trim() : null, pending: analyzing && !t.camelot },
    { k: "Energy", v: t.energy ? `${t.energy} / 10` : null, pending: analyzing && !t.energy },
    { k: "Length", v: formatDuration(t.durationMs) },
    { k: "Year", v: t.year ? String(t.year) : null },
    { k: "Genre", v: t.genre },
  ].filter((m) => m.v || m.pending);

  return (
    <div className="tc">
      {!compact && (
        <div className="tc__head">
          {t.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="tc__art" src={t.artworkUrl} alt="" onError={artFallback} />
          ) : (
            <div className="tc__art" />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 className="display tc__title">{t.title}</h3>
            <div className="tc__artist">{t.artist}</div>
          </div>
          {player.canPlay(t) && (
            <button
              className={`tc__play${player.currentId === t.id && player.playing ? " is-on" : ""}`}
              onClick={() => player.play(t.id, t.previewUrl, metaOf(t))}
              aria-label={player.currentId === t.id && player.playing ? "Pause" : player.full === "ready" || player.full === "app" ? "Play" : "Play the preview"}
              title={player.full === "ready" ? "Whole song, right here" : player.full === "app" ? "Whole song, on your Spotify" : "30-second preview"}
            >
              {player.currentId === t.id && player.playing ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>
          )}
        </div>
      )}

      <div className="tc__from">
        <div className="caps">
          {send.via.startsWith("played:")
            ? `${mine ? "You" : send.from.name.split(" ")[0]} played this${whereLabel(send.via)}`
            : `${mine ? "You sent this" : `From ${send.from.name}`}${viaLabel(send.via) ? ` · ${viaLabel(send.via)}` : ""}`}
          {" · "}
          {timeAgo(send.createdAt)}
        </div>
        {send.echoes.map((e) => (
          <div key={e.person.id} className="caps tc__echo">
            {e.person.id === me.id ? "You" : e.person.name.split(" ")[0]} {e.via.startsWith("played:") ? "played it too" : "liked it too"}
            {whereLabel(e.via)} · {timeAgo(e.at)}
          </div>
        ))}
        {send.note && (
          <div className="tc__note">
            {send.noteBy === "agent" && <span className="dot" title="Written by the agent" />}
            <span>{send.note}</span>
          </div>
        )}
        {(send.replies ?? []).length > 0 && (
          <div className="tc__back" aria-label="What came back">
            {send.replies.map((r) => {
              const who = r.person.id === me.id ? "You" : r.person.name.split(" ")[0];
              return (
                <div key={r.person.id} className="tc__backline">
                  <span className="caps">
                    {who} {r.status === "played" ? "played it out" : "kept it"} · {timeAgo(r.at)}
                  </span>
                  {r.reply && <span className="tc__reply">{r.reply}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {meta.length > 0 && (
        <div className="meta">
          {meta.map((m) => (
            <div key={m.k} title={["BPM", "Key", "Energy"].includes(m.k) ? "Estimated from the 30-second preview" : undefined}>
              <div className="caps">{m.k}</div>
              <div className={`meta__v${m.pending ? " is-pending" : ""}`}>{m.v ?? "…"}</div>
            </div>
          ))}
        </div>
      )}

      <div className="platforms">
        {primary && primaryKey && (
          <a className="btn btn--primary" href={primary.url} target="_blank" rel="noopener noreferrer">
            Open {primaryKey === "youtube" || primaryKey === "soundcloud" || primaryKey === "bandcamp" ? "on" : "in"} {PLATFORM_LABELS[primaryKey]} <IconOut />
          </a>
        )}
        {rest.map((k) => {
          const l = t.links[k]!;
          const buy = BUY_PLATFORMS.includes(k as PlatformKey);
          return (
            <a
              key={k}
              className={`btn btn--sm${buy && me.isDj ? " btn--accent" : ""}`}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Direct link"
            >
              {buy ? "Buy on " : ""}
              {PLATFORM_LABELS[k]}
            </a>
          );
        })}
        {!onlyHere &&
          search.map((k) => {
            const l = t.links[k]!;
            const buy = BUY_PLATFORMS.includes(k as PlatformKey);
            return (
              <a
                key={k}
                className={`btn btn--sm btn--ghost${buy && me.isDj ? " btn--accent" : ""}`}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Search on this platform"
              >
                {buy ? "Buy on " : ""}
                {PLATFORM_LABELS[k]}
              </a>
            );
          })}
      </div>
      {onlyHere && (
        <p className="faint platforms__note">
          Only {primaryKey ? `on ${PLATFORM_LABELS[primaryKey]}` : "here"}, as far as we can tell. Not a released record, so nothing to open elsewhere.{" "}
          {search.slice(0, 2).map((k, i) => (
            <span key={k}>
              {i ? " · " : "Search anyway: "}
              <a href={t.links[k]!.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                {PLATFORM_LABELS[k]}
              </a>
            </span>
          ))}
        </p>
      )}

      {onTrackChange && (
        <div className="history" style={{ color: "var(--ink-3)", fontSize: 13 }}>
          {!fixing ? (
            <button className="caps" style={{ color: "var(--ink-3)" }} onClick={startFix}>
              Wrong version or artwork?
            </button>
          ) : candidates === null ? (
            <span className="caps">Looking up versions</span>
          ) : (
            <>
              <div className="caps" style={{ marginBottom: 6 }}>
                Pick the right one
              </div>
              {candidates.length === 0 && <div>Nothing close in the catalog.</div>}
              {candidates.map((c) => (
                <button key={c.appleId} className="result" style={{ cursor: "pointer" }} onClick={() => pick(c)} disabled={picking === c.appleId}>
                  {c.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="result__art" src={c.artworkUrl.replace("600x600", "120x120")} alt="" onError={artFallback} />
                  ) : (
                    <div className="result__art" />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="queue__title" style={{ color: "var(--ink)" }}>
                      {c.title}
                    </div>
                    <div className="queue__artist">
                      {c.artist}
                      {c.album ? ` · ${c.album}` : ""}
                      {c.year ? ` · ${c.year}` : ""}
                    </div>
                  </div>
                </button>
              ))}
              <button className="btn btn--sm btn--ghost" style={{ marginTop: 6, marginLeft: -14 }} onClick={() => setFixing(false)}>
                Keep as is
              </button>
            </>
          )}
        </div>
      )}

      {send.history.length > 0 && (
        <div className="history">
          {send.history.map((h) => (
            <div key={h.sendId}>
              {h.fromName} sent this before, {timeAgo(h.createdAt)}.
            </div>
          ))}
        </div>
      )}

      {!mine && (
        <div className="tc__actions">
          <button className={`btn btn--sm${status === "saved" || status === "played" ? " btn--primary" : ""}`} onClick={onSave} disabled={!onSave}>
            {status === "saved" || status === "played" ? <IconCheck size={14} /> : <IconKeep size={14} />}
            {status === "saved" || status === "played" ? "Kept" : "Keep"}
          </button>
          {(me.isDj || status === "played") && (
            <button className={`btn btn--sm${status === "played" ? " btn--accent" : ""}`} onClick={onPlayed} disabled={!onPlayed}>
              <IconDeck size={14} />
              {status === "played" ? "Played out" : "Played it out"}
            </button>
          )}
          <button className="btn btn--sm btn--ghost" onClick={() => openAddTo(t)}>
            <IconPlus size={14} /> Add to a playlist
          </button>
          <button className="btn btn--sm btn--ghost" onClick={copyLink}>
            <IconCopy /> Copy link
          </button>
        </div>
      )}
      {mine && (
        <div className="tc__actions">
          <button className="btn btn--sm btn--ghost" onClick={() => openAddTo(t)}>
            <IconPlus size={14} /> Add to a playlist
          </button>
          <button className="btn btn--sm btn--ghost" onClick={copyLink}>
            <IconCopy /> Copy link
          </button>
        </div>
      )}

      {send.crewId && !send.id.startsWith("log:") && <Comments sendId={send.id} initialCount={send.commentCount} />}
      {!send.crewId && !mine && onReply && (
        <form
          className="replybox"
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) onReply(reply.trim());
          }}
        >
          <input
            className="field"
            placeholder={`A line back to ${send.from.name.split(" ")[0]}`}
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, 200))}
            aria-label="Reply"
          />
          <button className="btn btn--sm" type="submit" disabled={!reply.trim() || reply.trim() === (send.reaction?.reply ?? "")}>
            Reply
          </button>
        </form>
      )}
    </div>
  );
}
