"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Avatar, artFallback } from "./Avatar";
import { Confirm } from "./Confirm";
import { IconPlay, IconPause, IconClose } from "./Icons";
import { api, timeAgo, openOrder } from "@/lib/client";
import { openable } from "@/lib/resolve/links";
import type { Collection, CollectionTrack, Person } from "@/lib/types";

type Data = {
  collection: Collection;
  tracks: CollectionTrack[];
  crew: { id: string; name: string; size: number };
  /** A member of the crew, or a guest who came in by the playlist's link. */
  role: "member" | "guest";
  starter: Person | null;
};

/**
 * One of a crew's playlists, whole: its name (editable by the crew), its tracks in order, a Play
 * all, the way to each song, and a way out of it. A guest sees the same list and can play and
 * save it, and nothing else.
 */
export function CollectionView({ id }: { id: string }) {
  const { me, toast, setAccentTrack, collectionsVersion, bumpCollections, openShare } = useStore();
  const player = usePlayer();
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [name, setName] = useState("");
  const [playingAll, setPlayingAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const jumped = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Data>(`/api/collections/${encodeURIComponent(id)}`);
      setData(r);
      setName((n) => n || r.collection.name);
    } catch (e) {
      toast((e as Error).message);
      router.replace("/");
    }
  }, [id, toast, router]);

  useEffect(() => {
    load();
  }, [load, collectionsVersion]);

  // Arriving from the shared page with a song in mind: scroll to it and start its preview.
  useEffect(() => {
    const want = params.get("track");
    if (!want || !data || jumped.current) return;
    jumped.current = true;
    const hit = data.tracks.find((x) => x.track.id === want);
    if (!hit) return;
    document.getElementById(`cv-${want}`)?.scrollIntoView({ block: "center" });
    if (hit.track.previewUrl) player.play(hit.track.id, hit.track.previewUrl);
  }, [params, data, player]);

  useEffect(() => {
    const t = data?.tracks.find((x) => x.track.id === player.currentId)?.track ?? data?.tracks[0]?.track ?? null;
    setAccentTrack(t);
  }, [data, player.currentId, setAccentTrack]);

  // Play all: when a preview ends, start the next one down.
  useEffect(() => {
    if (!playingAll || !data || player.playing || player.progress < 1) return;
    const i = data.tracks.findIndex((x) => x.track.id === player.currentId);
    const next = data.tracks.slice(i + 1).find((x) => x.track.previewUrl);
    if (next) player.play(next.track.id, next.track.previewUrl);
    else setPlayingAll(false);
  }, [playingAll, player.playing, player.progress, player.currentId, data, player]);

  async function rename() {
    const n = name.trim();
    if (!data || !n || n === data.collection.name) return;
    setBusy("name");
    try {
      await api(`/api/collections/${data.collection.id}`, { method: "PATCH", json: { name: n } });
      setData((d) => d && { ...d, collection: { ...d.collection, name: n } });
      bumpCollections();
      toast("Renamed");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(trackId: string) {
    if (!data) return;
    setBusy(trackId);
    try {
      await api(`/api/collections/${data.collection.id}/tracks?track=${encodeURIComponent(trackId)}`, { method: "DELETE" });
      setData((d) => d && { ...d, tracks: d.tracks.filter((x) => x.track.id !== trackId), collection: { ...d.collection, count: d.collection.count - 1 } });
      bumpCollections();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** The playlist's own link: anyone can open it, no account. Share turns it on; it can be turned off again. */
  async function share() {
    if (!data) return;
    let code = data.collection.publicCode;
    if (!code) {
      try {
        const r = await api<{ collection: Collection }>(`/api/collections/${data.collection.id}`, { method: "PATCH", json: { link: true } });
        code = r.collection.publicCode;
        setData((d) => d && { ...d, collection: r.collection });
        bumpCollections();
      } catch (e) {
        toast((e as Error).message);
        return;
      }
    }
    openShare({
      title: data.collection.name,
      subtitle: `A playlist from ${crew!.name}`,
      url: `${location.origin}/p/${code}`,
      covers: data.collection.covers,
    });
  }

  /** Withdraws the link: whoever had it is out, and Share makes a new one next time. */
  async function unshare() {
    if (!data) return;
    try {
      const r = await api<{ collection: Collection }>(`/api/collections/${data.collection.id}`, { method: "PATCH", json: { link: false } });
      setData((d) => d && { ...d, collection: r.collection });
      bumpCollections();
      toast("Link turned off");
    } catch (e) {
      toast((e as Error).message);
    }
  }

  /** This playlist, saved to where the person listens. */
  async function saveTo(to: "spotify" | "apple") {
    if (!data) return;
    const label = to === "spotify" ? "Spotify" : "Apple Music";
    setBusy(`export:${to}`);
    try {
      const r = await fetch(`/api/collections/${data.collection.id}/export`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to }) });
      const j = (await r.json()) as { url?: string | null; added?: number; missed?: number; error?: string; reconnect?: boolean };
      if (r.status === 409 && j.reconnect) {
        toast(j.error ?? `Reconnect ${label} once`, { label: "Reconnect", run: () => (window.location.href = `/api/connect/${to}`) });
        return;
      }
      if (!r.ok) throw new Error(j.error ?? `Could not save to ${label}`);
      const note = `Saved to ${label}: ${j.added} ${j.added === 1 ? "track" : "tracks"}${j.missed ? `, ${j.missed} not there` : ""}`;
      if (j.url) toast(note, { label: "Open", run: () => window.open(j.url!, "_blank", "noopener") });
      else toast(note);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    if (!data) return;
    await api(`/api/collections/${data.collection.id}`, { method: "DELETE" });
    bumpCollections();
    // Home, where the shelf no longer shows it: that is the confirmation (a toast would not survive the page change).
    router.replace("/");
  }

  if (!data) return <div className="pl" aria-busy />;
  const { collection, tracks, crew, role, starter } = data;
  const guest = role === "guest";
  const together = crew.size > 1;
  const starterName = starter ? (starter.id === me.id ? "you" : starter.name.split(" ")[0]) : null;

  return (
    <div className="pl dayview">
      {guest && (
        <div className="cv__guest" role="note">
          <strong>{crew.name}</strong> shared this with you. Play it, save it to where you listen, and open any song where it lives.
          {starter && starter.id !== me.id ? ` ${starter.name.split(" ")[0]} can invite you into the crew.` : ""}
        </div>
      )}
      <header className="pl__head">
        <div className="pl__titles">
          <span className="caps">{crew.name} · Hand-made playlist</span>
          {guest ? (
            <h1 className="display crewpage__input" style={{ margin: 0 }}>
              {collection.name}
            </h1>
          ) : (
            <form
              className="crewpage__name"
              onSubmit={(e) => {
                e.preventDefault();
                rename();
              }}
            >
              <input className="display crewpage__input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Playlist name" maxLength={60} />
              {name.trim() && name.trim() !== collection.name && (
                <button className="btn btn--sm" type="submit" disabled={busy === "name"}>
                  Save
                </button>
              )}
            </form>
          )}
          <span className="muted pl__by">
            {tracks.length === 1 ? "1 track" : `${tracks.length} tracks`}
            {starterName ? ` · started by ${starterName}` : ""}
            {` · ${timeAgo(collection.createdAt)}`}
            {guest ? null : collection.publicCode ? (
              <>
                {" · anyone with the link can look; they sign up to play it · "}
                <button className="linklike" onClick={unshare}>
                  Turn the link off
                </button>
              </>
            ) : (
              " · only the crew can see it"
            )}
          </span>
        </div>
        <div className="pl__actions">
          {!guest && (
            <button className="btn btn--sm btn--primary" onClick={share}>
              Share
            </button>
          )}
          {me.sources.some((s) => s.kind === "spotify") && tracks.length > 0 && (
            <button className="btn btn--sm" onClick={() => saveTo("spotify")} disabled={busy === "export:spotify"}>
              {busy === "export:spotify" ? "Saving…" : "Save to Spotify"}
            </button>
          )}
          {me.sources.some((s) => s.kind === "apple") && tracks.length > 0 && (
            <button className="btn btn--sm" onClick={() => saveTo("apple")} disabled={busy === "export:apple"}>
              {busy === "export:apple" ? "Saving…" : "Save to Apple Music"}
            </button>
          )}
          {tracks.some((x) => x.track.previewUrl) && (
            <button
              className="btn btn--sm"
              onClick={() => {
                if (playingAll) {
                  setPlayingAll(false);
                  player.pause();
                  return;
                }
                const first = tracks.find((x) => x.track.previewUrl)!;
                setPlayingAll(true);
                player.play(first.track.id, first.track.previewUrl);
              }}
            >
              {playingAll ? <IconPause size={14} /> : <IconPlay size={14} />} {playingAll ? "Stop" : "Play all"}
            </button>
          )}
          {!guest && (
            <button className="btn btn--sm btn--ghost" onClick={() => setConfirm(true)}>
              Delete playlist
            </button>
          )}
        </div>
      </header>

      {tracks.length === 0 ? (
        <p className="muted pl__quiet">Nothing in here yet. Open any track in the log, the days or your history and tap &ldquo;Add to a playlist&rdquo;.</p>
      ) : (
        <ul className="pl__list">
          {tracks.map((x) => {
            const isCur = player.currentId === x.track.id;
            const where = openable(x.track.links, openOrder(me)).direct[0];
            const url = where ? x.track.links[where]?.url ?? null : null;
            return (
              <li
                key={x.track.id}
                id={`cv-${x.track.id}`}
                className={`pl__row${isCur && player.playing ? " is-playing" : ""}`}
                onClick={() => {
                  if (!x.track.previewUrl) return;
                  setPlayingAll(false);
                  player.play(x.track.id, x.track.previewUrl);
                }}
              >
                <div className="log__artwrap pl__artwrap">
                  {x.track.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="row__art" src={x.track.artworkUrl} alt="" onError={artFallback} />
                  ) : (
                    <div className="row__art" />
                  )}
                  {x.track.previewUrl && (
                    <button className="log__play" aria-label={isCur && player.playing ? "Pause" : "Preview"} type="button">
                      {isCur && player.playing ? <IconPause size={14} /> : <IconPlay size={14} />}
                    </button>
                  )}
                </div>
                <div className="pl__main">
                  <div className="row__title pl__title">{x.track.title}</div>
                  <div className="row__sub pl__sub">{x.track.artist}</div>
                </div>
                <div className="pl__meta">
                  {together && (
                    <span className="faces" title={`Added by ${x.addedBy.id === me.id ? "you" : x.addedBy.name.split(" ")[0]}`}>
                      <Avatar name={x.addedBy.name} url={x.addedBy.avatarUrl} size={22} />
                    </span>
                  )}
                  <span className="pl__when num">{timeAgo(x.addedAt)}</span>
                  {url && (
                    <a className="btn btn--sm btn--ghost" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                      Open
                    </a>
                  )}
                  {!guest && (
                    <button
                      className="iconbtn iconbtn--sm cv__remove"
                      aria-label={`Remove ${x.track.title} from this playlist`}
                      title="Remove from this playlist"
                      disabled={busy === x.track.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(x.track.id);
                      }}
                      type="button"
                    >
                      <IconClose size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Confirm
        open={confirm}
        title={`Delete "${collection.name}"?`}
        body="The tracks stay in the log, its days and everyone's history; only this list goes."
        confirmLabel="Delete"
        onClose={() => setConfirm(false)}
        onConfirm={destroy}
      />
    </div>
  );
}
