"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Avatar } from "./Avatar";
import { IconPlay, IconPause } from "./Icons";
import { SendRows, useTrackSheet, facesOf, tz } from "./Days";
import { api } from "@/lib/client";
import type { Send } from "@/lib/types";

/** One earlier day of the crew's playlist, whole: its own page, its own Play all. */
export function DayView({ date }: { date: string }) {
  const { crew, toast, setAccentTrack } = useStore();
  const player = usePlayer();
  const [data, setData] = useState<{ title: string; label: string; sends: Send[] } | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const crewId = crew?.id ?? null;

  const patchSend = useCallback((updated: Send) => {
    setData((d) => (d ? { ...d, sends: d.sends.map((s) => (s.id === updated.id ? updated : s)) } : d));
  }, []);
  const { open: openTrack, sheet } = useTrackSheet(patchSend);

  useEffect(() => {
    if (!crewId) return;
    setData(null);
    api<{ title: string; label: string; sends: Send[] }>(`/api/playlist/day?crew=${encodeURIComponent(crewId)}&date=${date}&tz=${encodeURIComponent(tz())}`)
      .then(setData)
      .catch((e) => toast((e as Error).message));
  }, [crewId, date, toast]);

  useEffect(() => {
    const t = data?.sends.find((s) => s.track.id === player.currentId)?.track ?? data?.sends[0]?.track ?? null;
    setAccentTrack(t);
  }, [data, player.currentId, setAccentTrack]);

  useEffect(() => {
    if (!playingAll || !data || player.playing || player.progress < 1) return;
    const i = data.sends.findIndex((s) => s.track.id === player.currentId);
    const next = data.sends.slice(i + 1).find((s) => s.track.previewUrl);
    if (next) player.play(next.track.id, next.track.previewUrl);
    else setPlayingAll(false);
  }, [playingAll, player.playing, player.progress, player.currentId, data, player]);

  if (!crew) {
    return (
      <div className="empty">
        <h2 className="display empty__title">No crew yet.</h2>
      </div>
    );
  }
  const together = crew.members.length > 1;
  const faces = data ? [...new Map(data.sends.flatMap((s) => facesOf(s)).map((p) => [p.id, p])).values()] : [];

  return (
    <div className="pl dayview">
      <header className="pl__head">
        <div className="pl__titles">
          <Link href="/days" className="caps pl__back">
            Days
          </Link>
          <h1 className="display pl__name">{data?.title ?? "…"}</h1>
          <span className="muted pl__by">
            {crew.name}
            {data ? ` · the playlist that day · ${data.sends.length === 1 ? "1 track" : `${data.sends.length} tracks`}` : ""}
            {together && faces.length > 0 && (
              <span className="faces" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                {faces.slice(0, 4).map((p) => (
                  <Avatar key={p.id} name={p.name} url={p.avatarUrl} size={20} />
                ))}
              </span>
            )}
          </span>
        </div>
        <div className="pl__actions">
          {data && data.sends.some((s) => s.track.previewUrl) && (
            <button
              className="btn btn--sm"
              onClick={() => {
                if (playingAll) {
                  setPlayingAll(false);
                  player.pause();
                  return;
                }
                const first = data.sends.find((s) => s.track.previewUrl);
                if (!first) return;
                setPlayingAll(true);
                player.play(first.track.id, first.track.previewUrl);
              }}
            >
              {playingAll ? <IconPause size={14} /> : <IconPlay size={14} />} {playingAll ? "Stop" : "Play all"}
            </button>
          )}
        </div>
      </header>
      {!data ? (
        <div className="skeleton" style={{ height: 64 }} />
      ) : data.sends.length === 0 ? (
        <p className="muted">Nothing came in that day.</p>
      ) : (
        <SendRows sends={data.sends} together={together} onOpen={openTrack} onPreview={() => setPlayingAll(false)} showDate />
      )}
      {sheet}
    </div>
  );
}
