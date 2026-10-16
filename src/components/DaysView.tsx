"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "./Store";
import { DayCards, useTrackSheet, tz, monthTitle, facesOf } from "./Days";
import { api } from "@/lib/client";
import type { DaySummary, Playlist } from "@/lib/types";

/** Every day the crew brought music in, by month, newest first. The full version of "Earlier". */
export function DaysView() {
  const { crew, toast, setAccentTrack } = useStore();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const crewId = crew?.id ?? null;
  const { open: openTrack, sheet } = useTrackSheet(() => undefined);

  const load = useCallback(async () => {
    if (!crewId) return;
    try {
      const r = await api<{ playlist: Playlist }>(`/api/playlist?crew=${encodeURIComponent(crewId)}&tz=${encodeURIComponent(tz())}`);
      setPlaylist(r.playlist);
    } catch (e) {
      toast((e as Error).message);
    }
  }, [crewId, toast]);
  useEffect(() => {
    setPlaylist(null);
    setAccentTrack(null);
    load();
  }, [crewId, load, setAccentTrack]);

  // Today sits on top as its own line when it has anything, so the index is complete.
  const months = useMemo(() => {
    if (!playlist) return [];
    const days: DaySummary[] = [...playlist.days];
    if (playlist.sends.length) {
      const art = playlist.sends.map((s) => s.track.artworkUrl).filter((u): u is string => !!u);
      const faces = [...new Map(playlist.sends.flatMap((s) => facesOf(s)).map((p) => [p.id, p])).values()];
      days.unshift({ date: playlist.today, count: playlist.sends.length, art: [...new Set(art)].slice(0, 4), faces, firstAt: 0, lastAt: 0 });
    }
    const out: Array<{ key: string; title: string; days: DaySummary[] }> = [];
    for (const d of days) {
      const key = d.date.slice(0, 7);
      const g = out[out.length - 1];
      if (g && g.key === key) g.days.push(d);
      else out.push({ key, title: monthTitle(d.date), days: [d] });
    }
    return out;
  }, [playlist]);

  if (!crew) {
    return (
      <div className="empty">
        <h2 className="display empty__title">No crew yet.</h2>
      </div>
    );
  }
  const together = crew.members.length > 1;
  const total = playlist?.count ?? 0;
  const dayCount = months.reduce((n, m) => n + m.days.length, 0);

  return (
    <div className="page daysview">
      <div className="page__head">
        <h1 className="display page__title">Days</h1>
        <span className="caps">
          {crew.name} · {dayCount === 1 ? "1 day" : `${dayCount} days`} · {total === 1 ? "1 track" : `${total} tracks`}
        </span>
      </div>
      {!playlist ? (
        <div className="skeleton" style={{ height: 64 }} />
      ) : months.length === 0 ? (
        <p className="muted">Nothing in here yet. Play something anywhere and the first day appears.</p>
      ) : (
        months.map((m) => (
          <section key={m.key} className="month">
            <div className="caps month__title">{m.title}</div>
            <DayCards days={m.days} today={playlist.today} crewId={crew.id} together={together} onOpenTrack={openTrack} weekday />
          </section>
        ))
      )}
      {sheet}
    </div>
  );
}
