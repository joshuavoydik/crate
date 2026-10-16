"use client";

import { useEffect, useState } from "react";
import { useStore } from "./Store";

/** Blurred artwork behind everything, crossfading between tracks. */
export function Backdrop() {
  const { accentTrack } = useStore();
  const url = accentTrack?.artworkUrl ?? null;
  const [layers, setLayers] = useState<Array<{ key: number; url: string; on: boolean }>>([]);

  useEffect(() => {
    if (!url) {
      setLayers((l) => l.map((x) => ({ ...x, on: false })));
      return;
    }
    setLayers((l) => {
      const key = (l[l.length - 1]?.key ?? 0) + 1;
      const next = [...l.map((x) => ({ ...x, on: false })), { key, url, on: false }].slice(-2);
      return next;
    });
    const t = setTimeout(() => setLayers((l) => l.map((x) => (x.url === url ? { ...x, on: true } : x))), 30);
    return () => clearTimeout(t);
  }, [url]);

  return (
    <div className="backdrop" aria-hidden>
      {layers.map((l) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={l.key} src={l.url} alt="" className={`backdrop__img${l.on ? " is-on" : ""}`} />
      ))}
      <div className="backdrop__veil" />
    </div>
  );
}
