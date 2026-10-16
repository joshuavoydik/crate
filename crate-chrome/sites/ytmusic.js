// YouTube Music: the player bar.
(() => {
  const read = () => {
    const bar = document.querySelector("ytmusic-player-bar");
    const video = document.querySelector("video");
    if (!bar || !video) return null;
    const title = ((bar.querySelector(".title") || {}).textContent || "").trim();
    const byline = ((bar.querySelector(".byline") || {}).textContent || "").trim();
    const artist = byline.split("•")[0].trim();
    const id = new URL(location.href).searchParams.get("v");
    if (!title) return null;
    return {
      source: "youtube",
      playing: !video.paused && !video.ended,
      title,
      artist,
      album: byline.split("•")[1] ? byline.split("•")[1].trim() : null,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
      positionMs: Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 1000) : null,
      url: id ? `https://music.youtube.com/watch?v=${id}` : location.href,
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
