"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useStore } from "./Store";
import { ShareActions } from "./ShareSheet";

/** "Crate on another device": one link, good for a day, that signs you in there. Sent to yourself. */
export function DeviceLink() {
  const { toast } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function make() {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/me/signin-link", { method: "POST" });
      setUrl(r.url);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="section" style={{ borderTop: 0, paddingTop: 0 }} id="devices">
      <div className="switch">
        <div>
          <div>Crate on another device</div>
          <div className="faint" style={{ fontSize: 13 }}>
            Make a link, send it to yourself, open it on the other device and press the button there: you are you there too. It works for a day, once.
          </div>
        </div>
        {!url && (
          <button className="btn btn--sm" onClick={make} disabled={busy}>
            {busy ? "…" : "Make a link"}
          </button>
        )}
      </div>
      {url && (
        <div style={{ margin: "12px 0 4px" }}>
          <ShareActions url={url} text="Open this on your other device to sign in to Crate" onDone={() => setUrl(null)} />
          <p className="faint" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
            Anyone who presses the button on this link is signed in as you, so send it only to yourself. It stops working after a day or once it has been used.
          </p>
        </div>
      )}
    </div>
  );
}
