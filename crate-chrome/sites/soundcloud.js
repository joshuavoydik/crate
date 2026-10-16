// SoundCloud: the player bar at the bottom of every page says what plays and whether it plays.
(() => {
  const clock = (s) => {
    if (!s || !/^\d+(:\d{1,2}){1,2}$/.test(s)) return null;
    return s.split(":").map(Number).reduce((a, n) => a * 60 + n, 0) * 1000;
  };
  const read = () => {
    const pc = document.querySelector(".playControl");
    const playing = !!(pc && pc.classList.contains("playing"));
    const t = document.querySelector(".playbackSoundBadge__titleLink");
    const a = document.querySelector(".playbackSoundBadge__lightLink");
    if (!t) return null;
    const title = (t.getAttribute("title") || t.textContent || "").trim();
    const artist = ((a && (a.getAttribute("title") || a.textContent)) || "").trim();
    const h = t.getAttribute("href") || "";
    const url = h ? (h.startsWith("http") ? h : `https://soundcloud.com${h}`) : location.href;
    const p = document.querySelector('.playbackTimeline__timePassed [aria-hidden="true"]');
    const d = document.querySelector('.playbackTimeline__duration [aria-hidden="true"]');
    if (!title) return null;
    return { source: "soundcloud", playing, title, artist, album: null, durationMs: clock(d && d.textContent.trim()), positionMs: clock(p && p.textContent.trim()), url };
  };
  const send = () => {
    try {
      chrome.runtime.sendMessage({ type: "now", report: read() });
    } catch {
      /* extension reloaded */
    }
  };
  send();
  setInterval(send, 3000);
})();
