"use client";

import { useEffect, useState } from "react";
import { initials } from "@/lib/client";

/** One transparent pixel: a failed image becomes its own blank tile instead of the browser's broken glyph. */
const BLANK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * onError for artwork: swaps the source for a transparent pixel, so the element keeps its size,
 * radius and surface color and reads as "no artwork" rather than "broken".
 */
export function artFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget;
  if (el.src === BLANK_PIXEL) return;
  el.src = BLANK_PIXEL;
  el.setAttribute("data-broken", "");
}

/** A person's photo, or their initials on a soft disc (also when the photo fails to load). */
export function Avatar({
  name,
  url,
  size = 28,
  className = "",
  live = false,
}: {
  name: string;
  url: string | null | undefined;
  size?: number;
  className?: string;
  live?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const photo = !!url && !broken;
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  return (
    <span className={`avatar${photo ? " avatar--img" : ""}${live ? " is-live" : ""} ${className}`} style={style} aria-hidden>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} onError={() => setBroken(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Shrinks an image file to a square JPEG data URL, in the browser. */
export async function squareDataUrl(file: File, px = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}
