"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useStore } from "./Store";

type State = "checking" | "unsupported" | "install" | "blocked" | "off" | "on" | "busy";

function keyBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const have = await navigator.serviceWorker.getRegistration();
  if (have) return have;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Pings: one switch. On an iPhone it needs Crate on the home screen first, so the card says so. */
export function PushCard() {
  const { toast } = useStore();
  const [state, setState] = useState<State>("checking");

  const check = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      setState(ios && !standalone ? "install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("blocked");
    const reg = await registration();
    if (!reg) return setState("unsupported");
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return setState("off");
    try {
      const r = await api<{ on: boolean }>(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`);
      setState(r.on ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  async function turnOn() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
      const reg = await registration();
      if (!reg) return setState("unsupported");
      const { key } = await api<{ key: string }>("/api/push");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }));
      await api("/api/push", { method: "POST", json: { subscription: sub.toJSON() } });
      setState("on");
      toast("Pings on, on this device");
    } catch (e) {
      toast((e as Error).message);
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/push", { method: "DELETE", json: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      toast((e as Error).message);
      setState("on");
    }
  }

  const on = state === "on";
  const hint =
    state === "install"
      ? "On an iPhone, pings need Crate on your home screen: Share, then Add to Home Screen, then come back here."
      : state === "blocked"
        ? "Notifications are blocked for Crate in your browser settings. Allow them there, then flip this on."
        : state === "unsupported"
          ? "This browser cannot do pings. Chrome, Safari on a home-screen app, or Edge can."
          : "A ping when someone sends you a song by hand or writes back on one of yours. Nothing else, ever. Per device.";

  return (
    <div className="switch" id="pings" style={{ scrollMarginTop: 80 }}>
      <div>
        <div>Pings</div>
        <div className="faint" style={{ fontSize: 13 }}>
          {hint}
        </div>
      </div>
      <button
        className={`toggle${on ? " is-on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label="Pings"
        disabled={state === "checking" || state === "busy" || state === "install" || state === "blocked" || state === "unsupported"}
        onClick={() => (on ? turnOff() : turnOn())}
      />
    </div>
  );
}
