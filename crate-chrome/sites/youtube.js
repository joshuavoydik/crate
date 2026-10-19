// YouTube: only pages YouTube itself files under Music, so a podcast never becomes a play.
// YouTube is one page that swaps videos in place, and the <meta> tags in its head can lag a
// video behind, so the genre is read per video id: from the head when the head is about this
// video, otherwise from a fresh copy of the page.
(() => {
  const genres = new Map(); // video id -> genre, or null while it loads
  const genreOf = (id) => {
    if (genres.has(id)) return genres.get(id);
    const ident = document.querySelector('meta[itemprop="identifier"]');
    const genre = document.querySelector('meta[itemprop="genre"]');
    if (ident && ident.content === id && genre) {
      genres.set(id, genre.content);
      return genre.content;
    }
    genres.set(id, null);
    fetch(`/watch?v=${encodeURIComponent(id)}`, { credentials: "same-origin" })
      .then((r) => r.text())
      .then((html) => {
        const m = html.match(/<meta itemprop="genre" content="([^"]*)"/);
        genres.set(id, m ? m[1] : "");
      })
      .catch(() => genres.delete(id));
    if (genres.size > 200) genres.delete(genres.keys().next().value);
    return null;
  };
  const read = () => {
    const id = new URL(location.href).searchParams.get("v");
    if (!id || genreOf(id) !== "Music") return null;
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (!video) return null;
    const title = (document.querySelector("h1.ytd-watch-metadata yt-formatted-string") || {}).textContent || document.title.replace(/\s*-\s*YouTube$/, "");
    const channel = ((document.querySelector("ytd-channel-name a") || {}).textContent || "").trim();
    if (!title.trim()) return null;
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
