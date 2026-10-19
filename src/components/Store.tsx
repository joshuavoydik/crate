"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, loadCrewId, storeCrewId } from "@/lib/client";
import type { Me, Crew, Track } from "@/lib/types";

type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

type Store = {
  me: Me;
  crew: Crew | null;
  setCrewId: (id: string) => void;
  refreshMe: () => Promise<void>;
  toast: (text: string, action?: Toast["action"]) => void;
  /** Send flow visibility and its prefilled link. */
  sendOpen: boolean;
  sendPrefill: string | null;
  openSend: (prefill?: string | null) => void;
  closeSend: () => void;
  /** The track whose artwork colors the page. */
  setAccentTrack: (t: Track | null) => void;
  accentTrack: Track | null;
  /** Bumped when a send is created so lists can refresh. */
  sendsVersion: number;
  bumpSends: () => void;
  /** Pocket mode: the whole app as a little handheld player. */
  pocket: boolean;
  setPocket: (on: boolean) => void;
  /** The friends rail on wide screens. */
  rail: boolean;
  setRail: (on: boolean) => void;
  /** The invite sheet: the one way to bring someone into the current crew, from any page. */
  inviteOpen: boolean;
  openInvite: () => void;
  closeInvite: () => void;
  /** The "add to a playlist" sheet, for one track, from any track card. */
  addToTrack: Track | null;
  openAddTo: (t: Track) => void;
  closeAddTo: () => void;
  /** Bumped when a playlist is made or changed, so shelves showing them reload. */
  collectionsVersion: number;
  bumpCollections: () => void;
  /** How many people in this crew are playing something right now; the red dot in the nav. */
  liveCount: number;
  setLiveCount: (n: number) => void;
};

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function StoreProvider({ initialMe, children }: { initialMe: Me; children: React.ReactNode }) {
  const [me, setMe] = useState<Me>(initialMe);
  const [crewId, setCrewIdState] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendPrefill, setSendPrefill] = useState<string | null>(null);
  const [accentTrack, setAccentTrack] = useState<Track | null>(null);
  const [sendsVersion, setSendsVersion] = useState(0);
  const [pocket, setPocketState] = useState(false);
  const [rail, setRailState] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addToTrack, setAddToTrack] = useState<Track | null>(null);
  const [collectionsVersion, setCollectionsVersion] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const toastId = useRef(0);

  useEffect(() => {
    try {
      setPocketState(localStorage.getItem("crate:pocket") === "1");
      setRailState(localStorage.getItem("crate:rail") !== "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setRail = useCallback((on: boolean) => {
    setRailState(on);
    try {
      localStorage.setItem("crate:rail", on ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setPocket = useCallback((on: boolean) => {
    setPocketState(on);
    try {
      if (on) localStorage.setItem("crate:pocket", "1");
      else localStorage.removeItem("crate:pocket");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const saved = loadCrewId();
    const valid = me.crews.find((c) => c.id === saved) ?? me.crews[0] ?? null;
    setCrewIdState(valid?.id ?? null);
  }, [me.crews]);

  const setCrewId = useCallback((id: string) => {
    setCrewIdState(id);
    storeCrewId(id);
  }, []);

  const refreshMe = useCallback(async () => {
    // A refresh that fails (offline, a server hiccup) leaves what is on screen; it never becomes the page's error.
    try {
      const r = await api<{ me: Me | null }>("/api/me");
      if (r.me) setMe(r.me);
    } catch {
      /* keep the last good state */
    }
  }, []);

  const toast = useCallback((text: string, action?: Toast["action"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200);
  }, []);

  const openSend = useCallback((prefill?: string | null) => {
    setSendPrefill(prefill ?? null);
    setSendOpen(true);
  }, []);
  const closeSend = useCallback(() => {
    setSendOpen(false);
    setSendPrefill(null);
  }, []);
  const bumpSends = useCallback(() => setSendsVersion((v) => v + 1), []);
  const openInvite = useCallback(() => setInviteOpen(true), []);
  const closeInvite = useCallback(() => setInviteOpen(false), []);
  const openAddTo = useCallback((t: Track) => setAddToTrack(t), []);
  const closeAddTo = useCallback(() => setAddToTrack(null), []);
  const bumpCollections = useCallback(() => setCollectionsVersion((v) => v + 1), []);

  const crew = useMemo(() => me.crews.find((c) => c.id === crewId) ?? me.crews[0] ?? null, [me.crews, crewId]);

  const value = useMemo<Store>(
    () => ({
      me,
      crew,
      setCrewId,
      refreshMe,
      toast,
      sendOpen,
      sendPrefill,
      openSend,
      closeSend,
      setAccentTrack,
      accentTrack,
      sendsVersion,
      bumpSends,
      pocket,
      setPocket,
      rail,
      setRail,
      inviteOpen,
      openInvite,
      closeInvite,
      addToTrack,
      openAddTo,
      closeAddTo,
      collectionsVersion,
      bumpCollections,
      liveCount,
      setLiveCount,
    }),
    [me, crew, setCrewId, refreshMe, toast, sendOpen, sendPrefill, openSend, closeSend, accentTrack, sendsVersion, bumpSends, pocket, setPocket, rail, setRail, inviteOpen, openInvite, closeInvite, addToTrack, openAddTo, closeAddTo, collectionsVersion, bumpCollections, liveCount],
  );

  // The accent lives on <html> so portaled sheets and the tab bar take the current track's color too.
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accentTrack?.accent ?? "#c8b89a");
  }, [accentTrack?.accent]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
