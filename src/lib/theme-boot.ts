import { TINT_TOKENS } from "./tints";

/**
 * Runs before paint so a saved appearance never flashes another one. Server-safe (no "use client").
 * Carries the derived tokens of every coloured ground, so a colour paints first time too.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var T=${JSON.stringify(
  Object.fromEntries(Object.entries(TINT_TOKENS).map(([id, t]) => [id, { s: t.scheme, v: t.vars }])),
)};var r=document.documentElement;var t=localStorage.getItem("crate:theme");var g=null;if(t==="light"||t==="dark"){r.setAttribute("data-theme",t);g=t==="light"?"#f2f0ea":"#0b0b0c";}else if(t&&T[t]){r.setAttribute("data-theme",T[t].s);for(var k in T[t].v)r.style.setProperty(k,T[t].v[k]);g=T[t].v["--surface"];}else{g=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"#f2f0ea":"#0b0b0c";}var ms=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<ms.length;i++)ms[i].setAttribute("content",g);}catch(e){}})();`;
