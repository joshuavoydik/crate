/**
 * Backgrounds you can choose, and the whole set of tokens each one implies. Black and Paper are the
 * instrument's own two and keep their hand-set tokens in CSS; a colour derives everything from the
 * one value: ink picked for contrast, the greys as mixes of ink into the ground, hairlines likewise,
 * and the signal red kept only while it still reads against the ground (an oxblood ground gets a
 * different signal). Plain WCAG arithmetic; no wheel, no library, nine grounds to start.
 */

export type Tint = { id: string; name: string; bg: string };

export const TINTS: Tint[] = [
  { id: "navy", name: "Navy", bg: "#101a33" },
  { id: "forest", name: "Forest", bg: "#0f2b22" },
  { id: "plum", name: "Plum", bg: "#2a1030" },
  { id: "oxblood", name: "Oxblood", bg: "#3b0d12" },
  { id: "butter", name: "Butter", bg: "#f3e6b0" },
  { id: "mint", name: "Mint", bg: "#d9efe2" },
  { id: "sky", name: "Sky", bg: "#d6e6f5" },
];

export const TINT_IDS = TINTS.map((t) => t.id);

type RGB = [number, number, number];

function hex(c: string): RGB {
  const h = c.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

function lin(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(c: string): number {
  const [r, g, b] = hex(c);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** `amount` of b into a, in sRGB (what color-mix(in srgb) does). */
export function mix(a: string, b: string, amount: number): string {
  const x = hex(a);
  const y = hex(b);
  return toHex([x[0] + (y[0] - x[0]) * amount, x[1] + (y[1] - x[1]) * amount, x[2] + (y[2] - x[2]) * amount]);
}

function hue(c: string): number {
  const [r, g, b] = hex(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function saturation(c: string): number {
  const [r, g, b] = hex(c).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  return d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
}

function hueGap(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return d > 180 ? 360 - d : d;
}

const INK_LIGHT = "#eceae4";
const INK_DARK = "#121212";
const SIGNAL = "#ff4d2e";
/** Signals in order of preference; the first that still reads against the ground wins. */
const SIGNALS = [SIGNAL, "#ffb000", "#3d7bff", "#1fd27a"];

export type TintTokens = { scheme: "light" | "dark"; vars: Record<string, string> };

/** Every token the skin needs, from one background. */
export function tokensFor(bg: string): TintTokens {
  const ink = contrast(bg, INK_LIGHT) >= contrast(bg, INK_DARK) ? INK_LIGHT : INK_DARK;
  const scheme: "light" | "dark" = ink === INK_LIGHT ? "dark" : "light";
  const vivid = saturation(bg) > 0.3;
  const signal = SIGNALS.find((s) => contrast(bg, s) >= 2.5 && (!vivid || hueGap(bg, s) >= 45)) ?? ink;
  return {
    scheme,
    vars: {
      "--surface": bg,
      "--surface-2": mix(bg, ink, 0.04),
      "--surface-3": mix(bg, ink, 0.1),
      "--ink": ink,
      "--ink-2": mix(ink, bg, 0.25),
      "--ink-3": mix(ink, bg, 0.4),
      "--ink-4": mix(bg, ink, 0.2),
      "--line": mix(bg, ink, 0.12),
      "--line-2": mix(bg, ink, 0.2),
      "--signal": signal,
      "--glass": scheme === "dark" ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)",
      "--glass-2": scheme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
    },
  };
}

/** The derived set for each tint, computed once at module load; the boot script carries the same map. */
export const TINT_TOKENS: Record<string, TintTokens> = Object.fromEntries(TINTS.map((t) => [t.id, tokensFor(t.bg)]));

/** The ground colour of a mode, for the browser's own chrome (the theme-color meta). */
export function groundOf(mode: string, systemLight: boolean): string {
  if (mode === "light" || (mode === "system" && systemLight)) return "#f2f0ea";
  if (mode === "dark" || mode === "system") return "#0b0b0c";
  return TINT_TOKENS[mode]?.vars["--surface"] ?? "#0b0b0c";
}
