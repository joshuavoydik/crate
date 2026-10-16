"use client";

import { initials } from "@/lib/client";

/** A person's photo, or their initials on a soft disc. */
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
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  return (
    <span className={`avatar${url ? " avatar--img" : ""}${live ? " is-live" : ""} ${className}`} style={style} aria-hidden>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} />
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
