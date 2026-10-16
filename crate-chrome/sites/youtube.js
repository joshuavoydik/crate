// YouTube: only pages YouTube itself files under Music, so a podcast never becomes a play.
(() => {
  const read = () => {
    const genre = document.querySelector('meta[itemprop="genre"]');
    if (!genre || genre.content !== "Music") return null;
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (!video) return null;
    const title = (document.querySelector("h1.ytd-watch-metadata yt-formatted-string") || {}).textContent || document.title.replace(/\s*-\s*YouTube$/, "");
    const channel = ((document.querySelector("ytd-channel-name a") || {}).textContent || "").trim();
    const id = new URL(location.href).searchParams.get("v");
    if (!title.trim() || !id) return null;
    return {
      source: "youtube",
      playing: !video.paused && !video.ended,
      title: title.trim(),
      artist: channel,
      album: null,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
      positionMs: Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 1000) : null,
      url: `https://www.youtube.com/watch?v=${id}`,
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
