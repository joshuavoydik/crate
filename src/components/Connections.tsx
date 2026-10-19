"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "./Store";
import { Confirm } from "./Confirm";
import { api, sourceName, timeAgo } from "@/lib/client";
import type { SourceInfo } from "@/lib/types";
import { MARK, SourceGlyph } from "./SourceMark";

/**
 * The consumer view of connections: one tap, your own already-signed-in account, done.
 * The one-time developer registration lives on /setup for whoever runs the app.
 */
const ORDER = ["spotify", "apple", "youtube", "soundcloud", "tidal", "lastfm"] as const;


const WHAT: Record<string, string> = {
  spotify: "Likes and recent plays",
  apple: "Recently played",
  youtube: "Liked videos, music only",
  soundcloud: "Liked tracks",
  tidal: "Favorite tracks",
  lastfm: "Scrobbles and loved tracks",
};

declare global {
  interface Window {
    MusicKit?: {
      configure: (c: { developerToken: string; app: { name: string; build: string } }) => Promise<unknown> | unknown;
      getInstance: () => { authorize: () => Promise<string> };
    };
  }
}

export function Connections({ showUnavailable = true }: { showUnavailable?: boolean }) {
  const { me, refreshMe, toast } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [lastfmName, setLastfmName] = useState("");
  const [askLastfm, setAskLastfm] = useState(false);
  const connected = new Map<string, SourceInfo>(me.sources.map((s) => [s.kind, s]));

  async function connectApple() {
    setBusy("apple");
    try {
      const { developerToken } = await api<{ developerToken: string }>("/api/connect/apple");
      if (!window.MusicKit) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Could not load Apple Music"));
          document.head.appendChild(s);
        });
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!window.MusicKit) throw new Error("Apple Music did not initialize");
      await window.MusicKit.configure({ developerToken, app: { name: "Crate", build: "1" } });
      const userToken = await window.MusicKit.getInstance().authorize();
      const r = await api<{ reports: Array<{ added: number; error?: string }> }>("/api/connect/apple", { method: "POST", json: { musicUserToken: userToken } });
      toast(r.reports[0]?.error ? `Apple Music connected; first sync failed: ${r.reports[0].error}` : "Apple Music connected");
      await refreshMe();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addLastfm() {
    const username = lastfmName.trim();
    if (!username) return;
    setBusy("lastfm");
    try {
      const r = await api<{ reports: Array<{ added: number; error?: string }> }>("/api/sources", { method: "POST", json: { kind: "lastfm", username } });
      toast(r.reports[0]?.error ? `Last.fm added; first sync failed: ${r.reports[0].error}` : "Last.fm connected");
      setAskLastfm(false);
      await refreshMe();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(kind: string) {
    setBusy(kind);
    try {
      await api(`/api/sources?kind=${kind}`, { method: "DELETE" });
      await refreshMe();
      toast(`${sourceName(kind)} disconnected`);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  function tap(kind: string) {
    const s = connected.get(kind);
    if (s && s.status === "reauth" && me.connectors[kind] && kind !== "apple" && kind !== "lastfm") {
      window.location.href = `/api/connect/${kind}`;
      return;
    }
    if (s) {
      setConfirm(kind);
      return;
    }
    if (!me.connectors[kind]) return;
    if (kind === "apple") return void connectApple();
    if (kind === "lastfm") return void setAskLastfm(true);
    window.location.href = `/api/connect/${kind}`;
  }

  const rows = ORDER.filter((k) => showUnavailable || me.connectors[k] || connected.has(k));

  return (
    <div>
      {rows.map((kind) => {
        const s = connected.get(kind);
        const available = !!me.connectors[kind];
        const sub = s
          ? s.status === "error"
            ? `Problem syncing: ${s.error}`
            : s.status === "reauth"
              ? (s.error ?? "Reconnect to turn on the newest features")
              : `Connected${s.label && s.label !== sourceName(kind) ? ` as ${s.label}` : ""}${s.lastSyncAt ? ` · synced ${timeAgo(s.lastSyncAt)}` : ""}`
          : available
            ? WHAT[kind]
            : "Not available yet";
        return (
          <div key={kind}>
            <button
              className="conn"
              onClick={() => tap(kind)}
              disabled={busy === kind || (!s && !available)}
              aria-label={`${s ? (s.status === "reauth" ? "Reconnect" : "Disconnect") : "Connect"} ${sourceName(kind)}`}
            >
              <span className="conn__mark" style={{ background: MARK[kind].bg, boxShadow: kind === "tidal" ? "inset 0 0 0 1px rgba(255,255,255,0.18)" : undefined, opacity: s || available ? 1 : 0.35 }} aria-hidden>
                <SourceGlyph kind={kind} size={30} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="conn__name" style={{ display: "block", opacity: s || available ? 1 : 0.5 }}>
                  {sourceName(kind)}
                </span>
                <span className={`conn__sub${s ? (s.status === "error" || s.status === "reauth" ? " is-error" : " is-on") : ""}`} style={{ display: "block" }}>
                  {sub}
                </span>
              </span>
              <span className="conn__cta">{busy === kind ? "…" : s ? (s.status === "reauth" ? "Reconnect" : "Connected") : available ? "Connect" : ""}</span>
            </button>
            {kind === "lastfm" && askLastfm && !s && (
              <form
                className="send__row"
                style={{ margin: "0 0 10px" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  addLastfm();
                }}
              >
                <input
                  className="field"
                  style={{ height: 40, fontSize: 15 }}
                  placeholder="Your Last.fm username"
                  value={lastfmName}
                  onChange={(e) => setLastfmName(e.target.value)}
                  aria-label="Last.fm username"
                  autoFocus
                />
                <button className="btn btn--sm" type="submit" disabled={busy === "lastfm" || !lastfmName.trim()}>
                  Add
                </button>
              </form>
            )}
          </div>
        );
      })}
      {ORDER.some((k) => !me.connectors[k] && !connected.has(k)) && showUnavailable && (
        <p className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
          Greyed-out services need a one-time registration by whoever runs this Crate.{" "}
          <Link href="/setup" style={{ textDecoration: "underline" }}>
            That&apos;s here
          </Link>
          . People using the app never see it.
        </p>
      )}
      <Confirm
        open={!!confirm}
        title={confirm ? `Disconnect ${sourceName(confirm)}?` : ""}
        body="What it already added to your log stays. New likes and plays stop coming in until you connect again."
        confirmLabel="Disconnect"
        busy={!!confirm && busy === confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && disconnect(confirm)}
      />
    </div>
  );
}
