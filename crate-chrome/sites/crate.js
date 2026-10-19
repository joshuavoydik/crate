// The Crate app itself: when its "Crate in Chrome" page offers a pairing (the app's address and
// this person's key, on the page they are signed into), take it and say so on the page. No
// extension id, no special link: being on the page is the handshake.
(() => {
  let last = null;
  const take = async () => {
    const el = document.querySelector("[data-crate-pair]");
    if (!el) return;
    const token = el.getAttribute("data-crate-pair") || "";
    const url = (el.getAttribute("data-crate-url") || location.origin).replace(/\/$/, "");
    if (!token.startsWith("crate_")) return;
    const key = `${url}|${token}`;
    if (last !== key) {
      last = key;
      await chrome.storage.local.set({ crate: { url, token, pairedAt: Date.now() } });
    }
    if (el.getAttribute("data-crate-paired") !== "1") el.setAttribute("data-crate-paired", "1");
  };
  take();
  new MutationObserver(() => take()).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-crate-pair"] });
})();
