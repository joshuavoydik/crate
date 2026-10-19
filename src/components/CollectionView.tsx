"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Avatar } from "./Avatar";
import { Confirm } from "./Confirm";
import { IconPlay, IconPause, IconClose } from "./Icons";
import { api, timeAgo } from "@/lib/client";
import type { Collection, CollectionTrack } from "@/lib/types";

/** One of the crew's playlists: its name (editable), its tracks in order, a Play all, a way out of it. */
export function CollectionView({ id }: { id: string }) {
  const { me, crew, toast, setAccentTrack, collectionsVersion, bumpCollections } = useStore();
  const player = usePlayer();
  const router = useRouter();
  const [data, setData] = useState<{ collection: Collection; tracks: CollectionTrack[] } | null>(null);
  const [name, setName] = useState("");
  const [playingAll, setPlayingAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ collection: Collection; tracks: CollectionTrack[] }>(`/api/collections/${encodeURIComponent(id)}`);
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

  /** The playlist's own link: anyone can open it, no account. */
  async function share() {
    if (!data) return;
    const url = `${location.origin}/p/${data.collection.publicCode}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${data.collection.name} · ${crew!.name} on Crate`, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied. Anyone can open it.");
    } catch {
      toast(url);
    }
  }

  async function destroy() {
    if (!data) return;
    await api(`/api/collections/${data.collection.id}`, { method: "DELETE" });
    bumpCollections();
    // Home, where the shelf no longer shows it: that is the confirmation (a toast would not survive the page change).
    router.replace("/");
  }

  if (!crew) {
    return (
      <div className="empty">
        <h2 className="display empty__title">No crew yet.</h2>
      </div>
    );
  }
  if (!data) return <div className="pl" aria-busy />;
  const { collection, tracks } = data;
  const together = crew.members.length > 1;
  const starter = crew.members.find((m) => m.id === collection.createdBy);

  return (
    <div className="pl dayview">
      <header className="pl__head">
        <div className="pl__titles">
          <span className="caps">{crew.name} · Playlist</span>
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
          <span className="muted pl__by">
            {tracks.length === 1 ? "1 track" : `${tracks.length} tracks`}
            {starter ? ` · started by ${starter.id === me.id ? "you" : starter.name.split(" ")[0]}` : ""}
            {` · ${timeAgo(collection.createdAt)}`}
          </span>
        </div>
        <div className="pl__actions">
          <button className="btn btn--sm btn--primary" onClick={share}>
            Share
          </button>
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
          <button className="btn btn--sm btn--ghost" onClick={() => setConfirm(true)}>
            Delete playlist
          </button>
        </div>
      </header>

      {tracks.length === 0 ? (
        <p className="muted pl__quiet">Nothing in here yet. Open any track in the playlist, the days or your log and tap &ldquo;Add to a playlist&rdquo;.</p>
      ) : (
        <ul className="pl__list">
          {tracks.map((x) => {
            const isCur = player.currentId === x.track.id;
            return (
              <li
                key={x.track.id}
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
                    <img className="row__art" src={x.track.artworkUrl} alt="" />
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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Confirm
        open={confirm}
        title={`Delete "${collection.name}"?`}
        body="The tracks stay in the crew's stream and in everyone's log; only this list goes."
        confirmLabel="Delete"
        onClose={() => setConfirm(false)}
        onConfirm={destroy}
      />
    </div>
  );
}
