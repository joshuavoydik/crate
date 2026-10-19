"use client";

import { useEffect } from "react";
import { StoreProvider, useStore } from "./Store";
import { PlayerProvider } from "./Player";
import { TopBar } from "./TopBar";
import { TabBar } from "./TabBar";
import { Backdrop } from "./Backdrop";
import { SendFlow } from "./SendFlow";
import { InviteSheet } from "./InviteSheet";
import { AddToPlaylistSheet } from "./Collections";
import { ShareSheet } from "./ShareSheet";
import { Pocket } from "./Pocket";
import { FriendsRail } from "./FriendsRail";
import { useLive } from "./LiveView";
import { extractUrl } from "@/lib/resolve/parse";
import type { Me } from "@/lib/types";

type Active = "reel" | "live" | "log" | "settings" | "crew";

export function Shell({ initialMe, active, incomingUrl, children }: { initialMe: Me; active: Active; incomingUrl?: string | null; children: React.ReactNode }) {
  return (
    <StoreProvider initialMe={initialMe}>
      <PlayerProvider>
        <Backdrop />
        <TopBar active={active} />
        <GlobalIntake incomingUrl={incomingUrl ?? null} />
        <SourceSync />
        <LivePulse />
        <RailFrame>{children}</RailFrame>
        <TabBar active={active} />
        <SendFlow />
        <InviteSheet />
        <AddToPlaylistSheet />
        <ShareSheet />
        <PocketGate />
      </PlayerProvider>
    </StoreProvider>
  );
}

/** The page plus the friends rail; the rail only takes room on wide screens. */
function RailFrame({ children }: { children: React.ReactNode }) {
  const { rail, crew } = useStore();
  const on = rail && !!crew;
  useEffect(() => {
    document.documentElement.classList.toggle("has-rail", on);
    return () => document.documentElement.classList.remove("has-rail");
  }, [on]);
  return (
    <>
      <main className="shell">{children}</main>
      <FriendsRail />
    </>
  );
}

/** Asks every half minute whether anyone in the crew is playing, so the nav can show its red dot. */
function LivePulse() {
  const { crew, setLiveCount } = useStore();
  const { data } = useLive(crew?.id ?? null, 30000);
  const n = data ? data.people.filter((p) => p.live).length : 0;
  useEffect(() => {
    setLiveCount(n);
  }, [n, setLiveCount]);
  return null;
}

/** Pocket mode sits over everything while it is on. */
function PocketGate() {
  const { pocket } = useStore();
  useEffect(() => {
    document.documentElement.classList.toggle("is-pocket", pocket);
    return () => document.documentElement.classList.remove("is-pocket");
  }, [pocket]);
  return pocket ? <Pocket /> : null;
}

/** Pulls from connected sources when the app opens and every few minutes while it is open. */
function SourceSync() {
  const { me, bumpSends, refreshMe } = useStore();
  const hasSources = me.sources.length > 0;
  useEffect(() => {
    if (!hasSources) return;
    let stop = false;
    const run = async () => {
      try {
        const r = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        const j = (await r.json()) as { reports?: Array<{ added: number; shared: number; error?: string }> };
        if (stop) return;
        if (j.reports?.some((x) => x.added > 0 || x.shared > 0)) bumpSends();
        if (j.reports?.some((x) => x.error)) refreshMe();
      } catch {
        /* offline */
      }
    };
    run();
    const id = setInterval(run, 2 * 60 * 1000);
    const onFocus = () => run();
    window.addEventListener("focus", onFocus);
    return () => {
      stop = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [hasSources, bumpSends, refreshMe]);
  return null;
}

/** Paste anywhere, drop a link, Cmd/Ctrl+K, or arrive via the share target: all open the send flow. */
function GlobalIntake({ incomingUrl }: { incomingUrl: string | null }) {
  const { openSend, sendOpen } = useStore();

  useEffect(() => {
    if (incomingUrl) openSend(incomingUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingUrl]);

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (sendOpen || isTyping()) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const url = extractUrl(text);
      if (url) {
        e.preventDefault();
        openSend(url);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSend();
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("text/uri-list") || e.dataTransfer?.types.includes("text/plain")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const text = e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text/plain") || "";
      const url = extractUrl(text);
      if (url) {
        e.preventDefault();
        openSend(url);
      }
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [openSend, sendOpen]);

  return null;
}
