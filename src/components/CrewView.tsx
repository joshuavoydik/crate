"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "./Store";
import { Avatar, squareDataUrl } from "./Avatar";
import { Confirm } from "./Confirm";
import { useLive } from "./LiveView";
import { api, timeAgo } from "@/lib/client";
import type { Me, Playlist, AutoShare } from "@/lib/types";

/** One crew: its name, people, invite link, the playlist name, public radio, and the viewer's own rules. */
export function CrewView({ appUrl }: { appUrl: string }) {
  const { me, crew, refreshMe, toast, setAccentTrack } = useStore();
  const router = useRouter();
  const [name, setName] = useState(crew?.name ?? "");
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [plName, setPlName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; run: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const { data: live } = useLive(crew?.id ?? null, 20000);
  const base = appUrl.replace(/\/$/, "");

  useEffect(() => setAccentTrack(null), [setAccentTrack]);
  useEffect(() => {
    setName(crew?.name ?? "");
    if (!crew) return;
    api<{ playlist: Playlist }>(`/api/playlist?crew=${encodeURIComponent(crew.id)}`)
      .then((r) => {
        setPlaylist(r.playlist);
        setPlName(r.playlist.name);
      })
      .catch(() => undefined);
  }, [crew?.id, crew?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!crew) {
    return (
      <div className="empty">
        <h2 className="display empty__title">No crew yet.</h2>
        <p className="muted">Start one from the top left.</p>
      </div>
    );
  }

  const others = crew.members.filter((m) => m.id !== me.id);
  const inviteUrl = `${base}/join/${crew.inviteCode}`;
  const radioUrl = crew.publicCode ? `${base}/radio/${crew.publicCode}` : null;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast(text);
    }
  }

  async function share(text: string, title: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: text });
        return;
      } catch {
        /* cancelled */
      }
    }
    copy(text, title);
  }

  async function patch(body: { name?: string; autoShare?: AutoShare; publicRadio?: boolean }, done: string) {
    setBusy(Object.keys(body)[0]);
    try {
      await api<{ me: Me }>(`/api/crews/${crew!.id}`, { method: "PATCH", json: body });
      await refreshMe();
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rename(nameOrRegenerate: string | true) {
    setBusy("playlist");
    try {
      const r = await api<{ playlist: Playlist }>("/api/playlist", {
        method: "POST",
        json: nameOrRegenerate === true ? { crew: crew!.id, regenerate: true } : { crew: crew!.id, name: nameOrRegenerate },
      });
      setPlaylist(r.playlist);
      setPlName(r.playlist.name);
      await refreshMe();
      toast(nameOrRegenerate === true ? `The agent calls it "${r.playlist.name}"` : "Renamed");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    await api(`/api/crews/${crew!.id}/membership`, { method: "DELETE" });
    await refreshMe();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="page crewpage">
      <div className="page__head crewpage__head">
        <div className="crewpage__photo">
          <Avatar name={crew.name} url={crew.avatarUrl ?? (others.length === 0 ? me.avatarUrl : null)} size={84} />
          <label className="crewpage__photobtn" title="Change the crew's picture">
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              aria-label="Choose a crew picture"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const dataUrl = await squareDataUrl(f, 256);
                  await api(`/api/crews/${crew!.id}/avatar`, { method: "POST", json: { dataUrl } });
                  await refreshMe();
                  toast("New look");
                } catch (x) {
                  toast((x as Error).message);
                }
              }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </label>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== crew.name) patch({ name: name.trim() }, "Renamed");
            }}
            className="crewpage__name"
          >
            <input className="display crewpage__input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Crew name" maxLength={60} />
            {name.trim() !== crew.name && name.trim() && (
              <button className="btn btn--sm" type="submit" disabled={busy === "name"}>
                Save
              </button>
            )}
          </form>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {others.length === 0 ? "Just you, for now. Invite someone and it becomes a two-way thing." : `${crew.members.length} people, one playlist.`}
            {crew.avatarUrl && (
              <>
                {" · "}
                <button
                  className="linkbtn"
                  onClick={async () => {
                    await api(`/api/crews/${crew.id}/avatar`, { method: "POST", json: { dataUrl: null } });
                    await refreshMe();
                  }}
                >
                  remove picture
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="section">
        <div className="caps">People</div>
        <ul className="people">
          {crew.members.map((m) => {
            const p = live?.people.find((x) => x.person.id === m.id);
            return (
              <li key={m.id} className="people__row">
                <Avatar name={m.name} url={m.avatarUrl} size={40} live={!!p?.live} />
                <div style={{ minWidth: 0 }}>
                  <div className="row__title">
                    {m.name}
                    {m.id === me.id ? <span className="faint"> · you</span> : null}
                    {m.isDj ? <span className="faint"> · DJ</span> : null}
                  </div>
                  <div className="row__sub">
                    {p?.live && p.title ? (
                      <>
                        <i className="live__dot" />
                        {p.title}
                        {p.artist ? ` · ${p.artist}` : ""}
                      </>
                    ) : p?.updatedAt && p.title ? (
                      `${p.title} · ${timeAgo(p.updatedAt)}`
                    ) : (
                      "Quiet"
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="crewpage__actions">
          <button className="btn btn--sm" onClick={() => share(inviteUrl, `Join ${crew.name} on Crate`)}>
            Invite someone
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => copy(inviteUrl, "Invite link")}>
            Copy invite link
          </button>
        </div>
      </div>

      <div className="section">
        <div className="caps">The playlist</div>
        <form
          className="send__row"
          onSubmit={(e) => {
            e.preventDefault();
            if (plName.trim() && plName.trim() !== playlist?.name) rename(plName.trim());
          }}
        >
          <input
            className="field"
            value={plName}
            onChange={(e) => setPlName(e.target.value)}
            aria-label="Playlist name"
            maxLength={60}
            placeholder={playlist?.name ?? "Naming…"}
          />
          <button className="btn btn--sm" type="submit" disabled={busy === "playlist" || !plName.trim() || plName.trim() === playlist?.name}>
            Rename
          </button>
        </form>
        <p className="faint" style={{ fontSize: 13, margin: "8px 0 0" }}>
          {playlist?.namedBy === "human" ? (
            <>
              You named it.{" "}
              <button className="linkbtn" onClick={() => rename(true)} disabled={busy === "playlist"}>
                Back to the day's name
              </button>
            </>
          ) : (
            "Named after the moment; it follows the day."
          )}
        </p>
      </div>

      <div className="section">
        <div className="caps">Rules</div>
        <div className="switch switch--rule">
          <div>
            <div>Lands here on its own</div>
            <div className="faint" style={{ fontSize: 13 }}>
              From now on, across every platform you connected.
            </div>
          </div>
          <div className="seg" role="radiogroup" aria-label="What lands here on its own">
            {(
              [
                ["plays", "Everything I play", "Everything you play will land here"],
                ["likes", "Just my likes", "Just your likes will land here"],
                ["off", "Nothing", "Nothing lands here on its own"],
              ] as Array<[AutoShare, string, string]>
            ).map(([mode, label, done]) => (
              <button key={mode} role="radio" aria-checked={crew.autoShare === mode} className={crew.autoShare === mode ? "is-on" : ""} onClick={() => patch({ autoShare: mode }, done)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="switch">
          <div>
            <div>Public radio</div>
            <div className="faint" style={{ fontSize: 13 }}>
              A page anyone with the link can open. No account.
            </div>
            {radioUrl && (
              <div className="crewpage__actions" style={{ marginTop: 8 }}>
                <a className="btn btn--sm btn--ghost" href={radioUrl} target="_blank" rel="noreferrer">
                  Open the station
                </a>
                <button className="btn btn--sm btn--ghost" onClick={() => share(radioUrl, `${crew.name} on Crate`)}>
                  Share the link
                </button>
              </div>
            )}
          </div>
          <button
            className={`toggle${crew.publicCode ? " is-on" : ""}`}
            role="switch"
            aria-checked={!!crew.publicCode}
            aria-label="Public radio"
            onClick={() => patch({ publicRadio: !crew.publicCode }, crew.publicCode ? "Station closed" : "On air")}
          />
        </div>
      </div>

      <div className="section">
        <button
          className="btn btn--sm btn--ghost"
          onClick={() =>
            setConfirm({
              title: `Leave ${crew.name}?`,
              body: others.length
                ? "The others keep the crew and everything in it. Your kept tracks stay in your log."
                : "You are the only member, so the crew and its playlist are removed.",
              label: "Leave",
              run: leave,
            })
          }
        >
          Leave this crew
        </button>
      </div>

      <Confirm
        open={!!confirm}
        title={confirm?.title ?? ""}
        body={confirm?.body ?? ""}
        confirmLabel={confirm?.label ?? "Remove"}
        busy={confirmBusy}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          setConfirmBusy(true);
          try {
            await confirm.run();
          } finally {
            setConfirmBusy(false);
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
