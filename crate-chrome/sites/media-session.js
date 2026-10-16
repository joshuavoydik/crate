// Everything else that plays music in a tab (TIDAL, Deezer, Amazon Music, Pandora, Apple Music
// and Spotify on the web): the page's own Media Session metadata, the same thing the OS media
// keys read, plus a sound check on the page's media element.
(() => {
  const sourceOf = () => {
    const h = location.hostname;
    if (h.includes("tidal")) return "tidal";
    if (h.includes("deezer")) return "deezer";
    if (h.includes("amazon")) return "amazon";
    if (h.includes("pandora")) return "pandora";
    if (h.includes("apple")) return "apple";
    if (h.includes("spotify")) return "spotify";
    return "web";
  };
  const read = () => {
    const ms = navigator.mediaSession;
    const m = ms && ms.metadata;
    if (!m || !m.title) return null;
    const media = Array.from(document.querySelectorAll("audio, video")).find((el) => !el.paused && !el.ended);
    const playing = ms.playbackState === "playing" || (!!media && ms.playbackState !== "paused");
    return {
      source: sourceOf(),
      playing,
      title: m.title,
      artist: m.artist || "",
      album: m.album || null,
      durationMs: media && Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : null,
      positionMs: media && Number.isFinite(media.currentTime) ? Math.round(media.currentTime * 1000) : null,
      url: location.href,
    };
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
