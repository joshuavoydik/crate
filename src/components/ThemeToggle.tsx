"use client";

import { useEffect, useState } from "react";
import { effectiveTheme, getThemeMode, setThemeMode, type ThemeMode } from "@/lib/theme";
import { TINTS } from "@/lib/tints";

const IconSun = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const IconMoon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

/** One tap flips between light and dark; the choice sticks on this device. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    setTheme(effectiveTheme());
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => setTheme(effectiveTheme());
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    setThemeMode(next);
    setTheme(next);
  }
  return (
    <button
      className="iconbtn"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}

/** System / Black / Paper, and seven coloured grounds, for Settings. Nothing chosen follows the system. */
export function ThemePicker() {
  const [mode, setMode] = useState<ThemeMode>("system");
  useEffect(() => setMode(getThemeMode()), []);
  const pick = (m: ThemeMode) => {
    setThemeMode(m);
    setMode(m);
  };
  const named: Array<[ThemeMode, string]> = [
    ["system", "System"],
    ["dark", "Black"],
    ["light", "Paper"],
  ];
  return (
    <div className="appearance">
      <div className="seg" role="radiogroup" aria-label="Appearance">
        {named.map(([m, label]) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "is-on" : ""} onClick={() => pick(m)}>
            {label}
          </button>
        ))}
      </div>
      <div className="grounds" role="radiogroup" aria-label="Background colour">
        {TINTS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={mode === t.id}
            aria-label={t.name}
            title={t.name}
            className="ground"
            style={{ background: t.bg }}
            onClick={() => pick(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
