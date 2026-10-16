import sharp from "sharp";

/**
 * Samples a single accent color from artwork: the most saturated, mid-lightness hue
 * that covers a meaningful share of the image. Returns a hex string, or null.
 */
export async function accentFromImage(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const { data, info } = await sharp(buf).resize(32, 32, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return pickAccent(data, info.channels);
  } catch {
    return null;
  }
}

export function pickAccent(data: Uint8Array | Buffer, channels: number): string {
  // 12 hue buckets x 3 lightness bands; weight each pixel by saturation.
  const buckets = new Map<string, { w: number; r: number; g: number; b: number }>();
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    n++;
    sumR += r;
    sumG += g;
    sumB += b;
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l < 0.12 || l > 0.9 || s < 0.18) continue;
    const key = `${Math.floor(h / 30)}:${l < 0.4 ? 0 : l < 0.65 ? 1 : 2}`;
    const w = s * (1 - Math.abs(l - 0.5));
    const cur = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    cur.w += w;
    cur.r += r * w;
    cur.g += g * w;
    cur.b += b * w;
    buckets.set(key, cur);
  }
  let best: { w: number; r: number; g: number; b: number } | null = null;
  for (const v of buckets.values()) if (!best || v.w > best.w) best = v;
  let r: number;
  let g: number;
  let b: number;
  if (best && best.w > 0) {
    r = best.r / best.w;
    g = best.g / best.w;
    b = best.b / best.w;
  } else if (n) {
    r = sumR / n;
    g = sumG / n;
    b = sumB / n;
  } else {
    return "#c8b89a";
  }
  // Lift very dark or muddy results so the accent reads against a near-black surface.
  const hsl = rgbToHsl(r, g, b);
  const l = Math.max(hsl.l, 0.5);
  const s = Math.max(hsl.s, 0.35);
  const [R, G, B] = hslToRgb(hsl.h, s, l);
  return `#${[R, G, B].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
