"use client";

import { TINT_IDS, TINT_TOKENS, groundOf } from "./tints";

/**
 * Appearance on this device: follow the system, Black, Paper, or one of the coloured grounds.
 * "dark" and "light" are the old names for Black and Paper and keep working.
 */
export type ThemeMode = "system" | "light" | "dark" | (string & {});
const KEY = "crate:theme";

export function isThemeMode(v: string | null | undefined): v is ThemeMode {
  return v === "system" || v === "light" || v === "dark" || (!!v && TINT_IDS.includes(v));
}

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return isThemeMode(v) ? v : "system";
  } catch {
    return "system";
  }
}

const VARS = Object.keys(TINT_TOKENS[TINT_IDS[0]].vars);

function systemLight(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  for (const k of VARS) root.style.removeProperty(k);
  if (mode === "system") root.removeAttribute("data-theme");
  else if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
  else {
    const t = TINT_TOKENS[mode];
    if (!t) return applyTheme("system");
    root.setAttribute("data-theme", t.scheme);
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  }
  const ground = groundOf(mode, systemLight());
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", ground));
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* private mode */
  }
  applyTheme(mode);
}

/** What is actually showing right now: the forced scheme, else the system's. */
export function effectiveTheme(): "light" | "dark" {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "light" || forced === "dark") return forced;
  return systemLight() ? "light" : "dark";
}
