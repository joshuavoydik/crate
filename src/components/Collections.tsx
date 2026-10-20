"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "./Store";
import { Sheet } from "./Sheet";
import { IconCheck, IconPlus } from "./Icons";
import { api } from "@/lib/client";
import type { Collection } from "@/lib/types";
import { artFallback } from "./Avatar";

/** Up to four covers in a square; one cover fills it. */
export function Mosaic({ covers, small }: { covers: string[]; small?: boolean }) {
  const c = covers.slice(0, 4);
  return (
    <span className={`mosaic${c.length === 1 ? " is-one" : c.length === 2 ? " is-two" : ""}${small ? " mosaic--sm" : ""}`} aria-hidden>
      {c.length ? (
        c.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={u} alt="" onError={artFallback} />
        ))
      ) : (
        <span />
      )}
    </span>
  );
}

/** One line to start a playlist: a name, then Start. */
function NewPlaylistForm({ busy, onSubmit, onCancel, autoFocus }: { busy: boolean; onSubmit: (name: string) => void; onCancel: () => void; autoFocus?: boolean }) {
  const [name, setName] = useState("");
  return (
    <form
      className="send__row shelf__new"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <input className="field" style={{ height: 40, fontSize: 15 }} placeholder="Name the playlist" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Playlist name" autoFocus={autoFocus} />
      <button className="btn btn--sm" type="submit" disabled={busy || !name.trim()}>
        Start
      </button>
      <button className="btn btn--sm btn--ghost" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/**
 * The crew's hand-made playlists on the main page: a card each, and a way to start one. The
 * playlist (today's, which fills itself) is the page; these are the lists people put together.
 */
export function PlaylistShelf({ crewId }: { crewId: string }) {
  const { collectionsVersion, bumpCollections, toast } = useStore();
  const [list, setList] = useState<Collection[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    api<{ collections: Collection[] }>(`/api/collections?crew=${encodeURIComponent(crewId)}`)
      .then((r) => {
        if (!stop) setList(r.collections);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [crewId, collectionsVersion]);

  async function create(name: string) {
    setBusy(true);
    try {
      await api("/api/collections", { method: "POST", json: { crew: crewId, name } });
      setCreating(false);
      bumpCollections();
      toast(`"${name}" started. Open any track to add it.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!list) return null;
  return (
    <section className="shelf" aria-label="Playlists">
      <div className="earlier__head">
        <span className="caps">Playlists</span>
        {!creating && (
          <button className="linkbtn earlier__all" onClick={() => setCreating(true)} type="button">
            New playlist
          </button>
        )}
      </div>
      <p className="faint shelf__empty" style={{ margin: "0 0 10px" }}>
        This playlist fills itself from what everyone plays. These are the ones you put together by hand
        {list.length === 0 ? ": open any track and tap “Add to a playlist”." : "."}
      </p>
      {creating && <NewPlaylistForm busy={busy} onSubmit={create} onCancel={() => setCreating(false)} autoFocus />}
      {list.length > 0 && (
        <div className="mixes">
          {list.map((c) => (
            <Link key={c.id} href={`/playlists/${c.id}`} className="mix">
              <Mosaic covers={c.covers} />
              <div className="mix__name">{c.name}</div>
              <div className="mix__n num">{c.count === 1 ? "1 track" : `${c.count} tracks`}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** The sheet behind "Add to a playlist": the crew's playlists with a check on the ones that have the track, and a way to start a new one with it. */
export function AddToPlaylistSheet() {
  const { crew, addToTrack, closeAddTo, bumpCollections, toast } = useStore();
  const [list, setList] = useState<Collection[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const open = !!addToTrack && !!crew;
  const crewId = crew?.id ?? null;
  const trackId = addToTrack?.id ?? null;

  useEffect(() => {
    if (!open || !crewId || !trackId) {
      setList(null);
      setCreating(false);
      return;
    }
    let stop = false;
    api<{ collections: Collection[] }>(`/api/collections?crew=${encodeURIComponent(crewId)}&track=${encodeURIComponent(trackId)}`)
      .then((r) => {
        if (stop) return;
        setList(r.collections);
        if (r.collections.length === 0) setCreating(true);
      })
      .catch((e) => toast((e as Error).message));
    return () => {
      stop = true;
    };
  }, [open, crewId, trackId, toast]);

  if (!open || !addToTrack || !crew) return null;
  const t = addToTrack;

  async function toggle(c: Collection) {
    setBusy(c.id);
    try {
      if (c.has) {
        await api(`/api/collections/${c.id}/tracks?track=${encodeURIComponent(t.id)}`, { method: "DELETE" });
        setList((l) => l && l.map((x) => (x.id === c.id ? { ...x, has: false, count: Math.max(0, x.count - 1) } : x)));
        toast(`Taken out of "${c.name}"`);
      } else {
        await api(`/api/collections/${c.id}/tracks`, { method: "POST", json: { trackId: t.id } });
        setList((l) => l && l.map((x) => (x.id === c.id ? { ...x, has: true, count: x.count + 1 } : x)));
        toast(`Added to "${c.name}"`);
      }
      bumpCollections();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create(name: string) {
    setBusy("new");
    try {
      await api("/api/collections", { method: "POST", json: { crew: crew!.id, name, trackId: t.id } });
      bumpCollections();
      toast(`"${name}" started with this one`);
      closeAddTo();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={closeAddTo} label="Add to a playlist">
      <div className="addto__head">
        {t.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="addto__art" src={t.artworkUrl} alt="" onError={artFallback} />
        ) : (
          <span className="addto__art" />
        )}
        <div style={{ minWidth: 0 }}>
          <div className="caps">Add to a playlist</div>
          <div className="row__title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t.title} <span className="faint">· {t.artist}</span>
          </div>
        </div>
      </div>
      {list === null ? (
        <p className="muted" style={{ fontSize: 14 }}>
          …
        </p>
      ) : (
        <>
          {list.map((c) => (
            <button key={c.id} className="addto__row" onClick={() => toggle(c)} disabled={busy === c.id} type="button" aria-pressed={!!c.has}>
              <Mosaic covers={c.covers} small />
              <span className="addto__name">
                {c.name}
                <span className="addto__n num"> · {c.count === 1 ? "1 track" : `${c.count} tracks`}</span>
              </span>
              <span className={`addto__check${c.has ? " is-on" : ""}`} aria-hidden>
                <IconCheck size={14} />
              </span>
            </button>
          ))}
          {creating ? (
            <NewPlaylistForm busy={busy === "new"} onSubmit={create} onCancel={() => (list.length ? setCreating(false) : closeAddTo())} autoFocus />
          ) : (
            <button className="addto__row" onClick={() => setCreating(true)} type="button">
              <span className="addto__plus" aria-hidden>
                <IconPlus size={16} />
              </span>
              <span className="addto__name">New playlist with this one</span>
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
