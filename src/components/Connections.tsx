"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "./Store";
import { usePlayer } from "./Player";
import { Confirm } from "./Confirm";
import { api, sourceName, timeAgo } from "@/lib/client";
import type { SourceInfo } from "@/lib/types";
import { MARK, SourceGlyph } from "./SourceMark";

/**
 * The consumer view of connections: one tap, your own already-signed-in account, done.
 * The one-time developer registration lives on /setup for whoever runs the app.
 */
const ORDER = ["spotify", "apple", "youtube", "soundcloud", "tidal", "lastfm"] as const;

/** What each account brings once connected, honestly: only Spotify and Last.fm carry plays. */
const WHAT: Record<string, string> = {
  spotify: "Plays and likes, from any device, a few minutes behind",
  apple: "Recently played, a few minutes behind",
  youtube: "Likes only; YouTube keeps watch history to itself",
  soundcloud: "Likes only; plays come through Chrome or the Mac helper",
  tidal: "Favorites only; plays come through Last.fm",
  lastfm: "Scrobbles count as plays, loved tracks as likes",
};

/** Why a row is greyed out, in plain words. Apple Music has another way in, so its row is not greyed. */
const NOT_HERE: Record<string, string> = {
  apple: "No account link here; plays in the Music app come in through Crate on your Mac",
};
const NOT_YET = "Not switched on in this Crate yet";

declare global {
  interface Window {
    MusicKit?: {
      configure: (c: { developerToken: string; app: { name: string; build: string } }) => Promise<unknown> | unknown;
      getInstance: () => { authorize: () => Promise<string> };
    };
  }
}

export function Connections({ showUnavailable = true, onMac }: { showUnavailable?: boolean; onMac?: () => void }) {
  const { me, refreshMe, toast } = useStore();
  const { full } = usePlayer();
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
    if (s && ((s.status === "reauth" && kind !== "apple" && kind !== "lastfm") || (kind === "spotify" && full === "reconnect")) && me.connectors[kind]) {
      window.location.href = `/api/connect/${kind}`;
      return;
    }
    if (s) {
      setConfirm(kind);
      return;
    }
    if (!me.connectors[kind]) {
      // Apple Music without an account link still has a way in: the Mac helper.
      if (kind === "apple" && onMac) onMac();
      return;
    }
    if (kind === "apple") return void connectApple();
    if (kind === "lastfm") return void setAskLastfm(true);
    window.location.href = `/api/connect/${kind}`;
  }

  // Apple Music always has a row: when it cannot be linked here, the row says where its plays come in.
  const rows = ORDER.filter((k) => showUnavailable || me.connectors[k] || connected.has(k) || k === "apple");
  const greyed = ORDER.some((k) => !me.connectors[k] && !connected.has(k) && !NOT_HERE[k]);

  return (
    <div>
      {rows.map((kind) => {
        const s = connected.get(kind);
        const available = !!me.connectors[kind];
        const otherWay = !s && !available && !!NOT_HERE[kind];
        const dim = !s && !available && !otherWay;
        // Spotify's row also says whether whole songs play, since that is what most people want from it.
        const whole =
          kind === "spotify" && s && s.status !== "error" && s.status !== "reauth"
            ? full === "reconnect"
              ? " · reconnect once to play whole songs in Crate"
              : full === "premium"
                ? " · whole songs here need Spotify Premium, so previews play"
                : full === "ready"
                  ? " · whole songs play right here"
                  : full === "app"
                    ? " · whole songs play on your Spotify app"
                    : ""
            : "";
        const sub = s
          ? s.status === "error"
            ? `Problem syncing: ${s.error}`
            : s.status === "reauth"
              ? (s.error ?? "Reconnect to turn on the newest features")
              : `Connected${s.label && s.label !== sourceName(kind) ? ` as ${s.label}` : ""}${s.lastSyncAt ? ` · synced ${timeAgo(s.lastSyncAt)}` : ""}${whole}`
          : available
            ? WHAT[kind]
            : (NOT_HERE[kind] ?? NOT_YET);
        const cta = busy === kind ? "…" : s ? (s.status === "reauth" || (kind === "spotify" && full === "reconnect") ? "Reconnect" : "Connected") : available ? "Connect" : otherWay && onMac ? "On a Mac" : "";
        return (
          <div key={kind}>
            <button
              className="conn"
              onClick={() => tap(kind)}
              disabled={busy === kind || dim || (otherWay && !onMac)}
              aria-label={`${s ? (s.status === "reauth" || (kind === "spotify" && full === "reconnect") ? "Reconnect" : "Disconnect") : otherWay ? "How to bring in" : "Connect"} ${sourceName(kind)}`}
            >
              <span className="conn__mark" style={{ background: MARK[kind].bg, boxShadow: kind === "tidal" ? "inset 0 0 0 1px rgba(255,255,255,0.18)" : undefined, opacity: dim ? 0.35 : 1 }} aria-hidden>
                <SourceGlyph kind={kind} size={30} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="conn__name" style={{ display: "block", opacity: dim ? 0.5 : 1 }}>
                  {sourceName(kind)}
                </span>
                <span className={`conn__sub${s ? (s.status === "error" || s.status === "reauth" ? " is-error" : " is-on") : ""}`} style={{ display: "block" }}>
                  {sub}
                </span>
              </span>
              <span className="conn__cta">{cta}</span>
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
      {greyed && showUnavailable && (
        <p className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>
          Greyed out means not switched on in this Crate yet.{" "}
          {me.isMaker ? (
            <>
              You can turn it on from{" "}
              <Link href="/setup" style={{ textDecoration: "underline" }}>
                App setup
              </Link>
              .
            </>
          ) : (
            "Whoever runs this Crate can turn it on."
          )}
        </p>
      )}
      <Confirm
        open={!!confirm}
        title={confirm ? `Disconnect ${sourceName(confirm)}?` : ""}
        body="What it already added to your history stays. New likes and plays stop coming in until you connect again."
        confirmLabel="Disconnect"
        busy={!!confirm && busy === confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && disconnect(confirm)}
      />
    </div>
  );
}
