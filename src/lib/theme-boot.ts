/** Runs before paint so a saved theme never flashes the other one. Server-safe (no "use client"). */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("crate:theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
