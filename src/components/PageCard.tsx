"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useStore } from "./Store";
import { IconShare } from "./Icons";

const LEVELS: Array<["off" | "playlists" | "plays", string, string]> = [
  ["off", "Off", "No page. The link leads nowhere."],
  ["playlists", "Playlists", "Your page shows the playlists you have shared, and people can follow you."],
  ["plays", "Plays too", "Your page also shows what you are playing, now and lately, like Live does for the crew."],
];

/**
 * Your page: the one link that is yours to post anywhere. Pick what it shows, pick the handle,
 * share it. The crew is never on it.
 */
export function PageCard() {
  const { me, toast, refreshMe, openShare } = useStore();
  const [handle, setHandle] = useState(me.handle);
  const [busy, setBusy] = useState(false);
  useEffect(() => setHandle(me.handle), [me.handle]);

  async function setLevel(level: "off" | "playlists" | "plays") {
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", json: { public: level } });
      await refreshMe();
      if (level !== "off" && !me.handle) toast("Your page is on");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveHandle(e: React.FormEvent) {
    e.preventDefault();
    const h = handle.trim().replace(/^@/, "");
    if (!h || h === me.handle) return;
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", json: { handle: h } });
      await refreshMe();
      toast("Handle saved");
    } catch (x) {
      toast((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const url = typeof window !== "undefined" && me.handle ? `${location.origin}/u/${me.handle}` : "";
  const on = me.public !== "off";
  return (
    <div className="section" style={{ borderTop: 0, paddingTop: 0 }} id="page">
      <div className="switch switch--stack">
        <div>
          <div>Your page</div>
          <div className="faint" style={{ fontSize: 13 }}>
            A link that is yours to post anywhere. People who open it can hear what you share and follow you, without an invite and without joining your
            crew. Your crew&apos;s log stays private either way.
            {me.followers > 0 ? ` ${me.followers} ${me.followers === 1 ? "person follows" : "people follow"} you.` : ""}
          </div>
        </div>
        <div className="seg" role="radiogroup" aria-label="Your page shows">
          {LEVELS.map(([v, label]) => (
            <button key={v} role="radio" aria-checked={me.public === v} className={me.public === v ? "is-on" : ""} onClick={() => setLevel(v)} disabled={busy}>
              {label}
            </button>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          {LEVELS.find(([v]) => v === me.public)?.[2]}
        </div>
        {on && (
          <>
            <form className="pagecard__handle" onSubmit={saveHandle}>
              <span className="pagecard__at caps">{typeof window !== "undefined" ? location.host : ""}/u/</span>
              <input
                className="field"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                aria-label="Handle"
                maxLength={24}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {handle.trim().replace(/^@/, "") !== me.handle && (
                <button className="btn btn--sm" type="submit" disabled={busy}>
                  Save
                </button>
              )}
            </form>
            <div className="signincard__row" style={{ marginTop: 4 }}>
              <button className="btn btn--sm btn--primary" onClick={() => openShare({ title: `${me.name} on Crate`, subtitle: "My Crate page", url })} disabled={!url}>
                <IconShare size={14} /> Share your page
              </button>
              {me.handle && (
                <Link href={`/u/${me.handle}`} className="btn btn--sm btn--ghost">
                  View
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
