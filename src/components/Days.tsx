"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Sheet } from "./Sheet";
import { TrackCard } from "./TrackCard";
import { Avatar, artFallback } from "./Avatar";
import { SourceMark, platformOfVia } from "./SourceMark";
import { IconPlay, IconPause, IconKeep, IconDeck, IconChevron, IconPlus } from "./Icons";
import { api, timeAgo, viaLabel, metaOf } from "@/lib/client";
import type { DaySummary, Send, ReactionStatus, Track, Person } from "@/lib/types";

/**
 * The crew's stream as days. Today is the page; earlier days fold into one line each (a few
 * covers, the date, how many, whose faces) and open in place. The same pieces serve the main
 * page (a handful of recent days), the Days page (every day, by month) and a single day's page.
 */

export const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Everyone who brought a track up: whoever sent it, then whoever echoed it. */
export function facesOf(s: Send): Person[] {
  const seen = new Set<string>();
  return [s.from, ...s.echoes.map((e) => e.person)].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

// ---------- one sheet for any track, anywhere ----------

export function useTrackSheet(patch: (s: Send) => void) {
  const { me, toast } = useStore();
  const [open, setOpen] = useState<Send | null>(null);
  const patchTrack = useCallback(
    (t: Track) => {
      setOpen((o) => (o && o.track.id === t.id ? { ...o, track: t } : o));
    },
    [],
  );
  const react = useCallback(
    async (send: Send, status: ReactionStatus, reply?: string) => {
      try {
        const r = await api<{ send: Send }>(`/api/sends/${send.id}/react`, { method: "POST", json: reply === undefined ? { status } : { status, reply } });
        patch(r.send);
        setOpen((o) => (o && o.id === r.send.id ? r.send : o));
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [patch, toast],
  );
  const sheet = (
    <Sheet open={!!open} onClose={() => setOpen(null)} label="Track">
      {open && (
        <TrackCard
          send={open}
          analyzing={false}
          onSave={open.from.id === me.id ? undefined : () => react(open, "saved").then(() => toast("Kept"))}
          onPlayed={open.from.id === me.id ? undefined : () => react(open, "played").then(() => toast("Marked as played out"))}
          onReply={(text) => react(open, open.reaction?.status ?? "seen", text).then(() => toast("Sent back"))}
          onTrackChange={patchTrack}
        />
      )}
    </Sheet>
  );
  return { open: setOpen, sheet };
}

// ---------- rows ----------

export function SendRows({
  sends,
  together,
  onOpen,
  onPreview,
  showDate,
}: {
  sends: Send[];
  together: boolean;
  onOpen: (s: Send) => void;
  /** Called before a preview starts, so a "play all" elsewhere can stand down. */
  onPreview?: () => void;
  /** Time of day instead of "2h ago", for a day that is over. */
  showDate?: boolean;
}) {
  const { me, openAddTo } = useStore();
  const player = usePlayer();
  return (
    <ul className="pl__list">
      {sends.map((s) => {
        const isCur = player.currentId === s.track.id;
        const status = s.reaction?.status;
        const mine = s.from.id === me.id;
        const intentional = !s.via.startsWith("played:");
        // Someone chose to send this (from the app or by message), as opposed to a play or a like that landed on its own.
        const hand = s.via === "app" || s.via === "imessage";
        const excerpt = hand && s.note && s.noteBy === "human" ? s.note : null;
        const faces = facesOf(s);
        return (
          <li
            key={s.id}
            className={`pl__row${isCur && player.playing ? " is-playing" : ""}${!mine && intentional && (!status || status === "seen") ? " is-new" : ""}`}
          >
            <div className="log__artwrap pl__artwrap">
              {s.track.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="row__art" src={s.track.artworkUrl} alt="" onError={artFallback} />
              ) : (
                <div className="row__art" />
              )}
              {player.canPlay(s.track) && (
                <button
                  className="log__play"
                  aria-label={isCur && player.playing ? "Pause" : "Preview"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview?.();
                    player.play(s.track.id, s.track.previewUrl, metaOf(s.track));
                  }}
                >
                  {isCur && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                </button>
              )}
            </div>
            <div className="pl__main">
              <button type="button" className="pl__open" onClick={() => onOpen(s)}>
                <div className="row__title pl__title">{s.track.title}</div>
                <div className="row__sub pl__sub">{s.track.artist}</div>
                {excerpt && <div className="pl__excerpt">{excerpt}</div>}
              </button>
            </div>
            <div className="pl__meta">
              {hand && <span className="pl__sender">from {mine ? "you" : s.from.name.split(" ")[0]}</span>}
              {together && (
                <span
                  className={`faces${faces.length > 1 ? " is-many" : ""}`}
                  title={faces.map((p) => (p.id === me.id ? "You" : p.name.split(" ")[0])).join(", ") + (viaLabel(s.via) ? ` · ${viaLabel(s.via)}` : "")}
                >
                  {faces.slice(0, 3).map((p) => (
                    <Avatar key={p.id} name={p.name} url={p.avatarUrl} size={22} />
                  ))}
                </span>
              )}
              <SourceMark kind={platformOfVia(s.via)} />
              <span className="pl__when num">
                {showDate ? new Date(s.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : timeAgo(s.activeAt)}
              </span>
              {status === "saved" && (
                <span className="pl__badge" title="Kept">
                  <IconKeep size={12} />
                </span>
              )}
              {status === "played" && (
                <span className="pl__badge" title="Played out">
                  <IconDeck size={12} />
                </span>
              )}
              {s.commentCount > 0 && (
                <span className="pl__badge pl__badge--n readout" title={s.commentCount === 1 ? "1 comment" : `${s.commentCount} comments`}>
                  {s.commentCount}
                </span>
              )}
              <button type="button" className="rowadd" aria-label="Add to a playlist" title="Add to a playlist" onClick={() => openAddTo(s.track)}>
                <IconPlus size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- a day, folded ----------

export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const daysAgo = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo > 1 && daysAgo < 7) return noon.toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long" });
  return noon.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", year: y === ty ? undefined : "numeric" });
}

export function dayTitle(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

export function monthTitle(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15, 12)).toLocaleDateString(undefined, { timeZone: "UTC", month: "long", year: "numeric" });
}

export function DayCard({
  day,
  today,
  open,
  onToggle,
  crewId,
  together,
  onOpenTrack,
  weekday,
}: {
  day: DaySummary;
  today: string;
  open: boolean;
  onToggle: () => void;
  crewId: string;
  together: boolean;
  onOpenTrack: (s: Send) => void;
  /** On the Days page the label carries the weekday too, since the month is the heading. */
  weekday?: boolean;
}) {
  const { me, toast } = useStore();
  const player = usePlayer();
  const [sends, setSends] = useState<Send[] | null>(null);
  const [playingAll, setPlayingAll] = useState(false);

  useEffect(() => {
    if (!open || sends) return;
    api<{ sends: Send[] }>(`/api/playlist/day?crew=${encodeURIComponent(crewId)}&date=${day.date}&tz=${encodeURIComponent(tz())}`)
      .then((r) => setSends(r.sends))
      .catch((e) => toast((e as Error).message));
  }, [open, sends, crewId, day.date, toast]);

  // Play all for this day: when a preview ends, the next one with a preview starts.
  useEffect(() => {
    if (!playingAll || !sends || player.playing || player.progress < 1) return;
    const i = sends.findIndex((s) => s.track.id === player.currentId);
    const next = sends.slice(i + 1).find((s) => player.canPlay(s.track));
    if (next) player.play(next.track.id, next.track.previewUrl, metaOf(next.track));
    else setPlayingAll(false);
  }, [playingAll, player.playing, player.progress, player.currentId, sends, player]);

  const label = weekday ? dayTitle(day.date) : dayLabel(day.date, today);
  const who = day.faces.map((p) => (p.id === me.id ? "you" : p.name.split(" ")[0]));
  return (
    <li className={`day${open ? " is-open" : ""}`}>
      <button className="day__head" onClick={onToggle} aria-expanded={open}>
        <span className="day__covers" aria-hidden>
          {day.art.slice(0, 4).map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" onError={artFallback} />
          ))}
          {day.art.length === 0 && <span className="day__blank" />}
        </span>
        <span className="day__text">
          <span className="day__label">{label}</span>
          <span className="day__sub">
            {day.count === 1 ? "1 track" : `${day.count} tracks`}
            {together && who.length ? ` · ${who.join(", ")}` : ""}
          </span>
        </span>
        {together && (
          <span className="faces day__faces">
            {day.faces.slice(0, 3).map((p) => (
              <Avatar key={p.id} name={p.name} url={p.avatarUrl} size={20} />
            ))}
          </span>
        )}
        <IconChevron className="day__chev" />
      </button>
      {open && (
        <div className="day__body">
          <div className="day__tools">
            {sends && sends.some((s) => player.canPlay(s.track)) && (
              <button
                className="btn btn--sm"
                onClick={() => {
                  if (playingAll) {
                    setPlayingAll(false);
                    player.pause();
                    return;
                  }
                  const first = sends.find((s) => player.canPlay(s.track));
                  if (!first) return;
                  setPlayingAll(true);
                  player.play(first.track.id, first.track.previewUrl, metaOf(first.track));
                }}
              >
                {playingAll ? <IconPause size={14} /> : <IconPlay size={14} />} {playingAll ? "Stop" : "Play all"}
              </button>
            )}
            <Link className="btn btn--sm btn--ghost" href={`/days/${day.date}`}>
              Open the day
            </Link>
          </div>
          {sends ? (
            <SendRows sends={sends} together={together} onOpen={onOpenTrack} onPreview={() => setPlayingAll(false)} showDate />
          ) : (
            <div className="skeleton" style={{ height: 52, margin: "8px 0" }} />
          )}
        </div>
      )}
    </li>
  );
}

/** A run of day cards with one open at a time; `limit` keeps the main page short. */
export function DayCards({
  days,
  today,
  crewId,
  together,
  onOpenTrack,
  limit,
  weekday,
  initialOpen,
}: {
  days: DaySummary[];
  today: string;
  crewId: string;
  together: boolean;
  onOpenTrack: (s: Send) => void;
  limit?: number;
  weekday?: boolean;
  /** Open this date on first render (the newest day when today is quiet). */
  initialOpen?: string | null;
}) {
  const [openDate, setOpenDate] = useState<string | null>(initialOpen ?? null);
  const shown = useMemo(() => (limit ? days.slice(0, limit) : days), [days, limit]);
  return (
    <ul className="days">
      {shown.map((d) => (
        <DayCard
          key={d.date}
          day={d}
          today={today}
          open={openDate === d.date}
          onToggle={() => setOpenDate((o) => (o === d.date ? null : d.date))}
          crewId={crewId}
          together={together}
          onOpenTrack={onOpenTrack}
          weekday={weekday}
        />
      ))}
    </ul>
  );
}
