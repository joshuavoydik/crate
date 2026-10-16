// Opened from Crate's Settings with the pairing in the URL fragment, this stores it; opened from
// the toolbar, it just says whether this browser is connected to a Crate.
(async () => {
  const state = document.getElementById("state");
  const where = document.getElementById("where");
  const hash = new URLSearchParams(location.hash.slice(1));
  const url = hash.get("url");
  const token = hash.get("token");
  if (url && token && token.startsWith("crate_")) {
    await chrome.storage.local.set({ crate: { url, token, pairedAt: Date.now() } });
    history.replaceState(null, "", location.pathname);
    state.innerHTML = '<span class="ok">Connected.</span> What plays in this browser now shows up in your Crate. You can close this tab.';
    where.textContent = url;
    return;
  }
  const { crate } = await chrome.storage.local.get("crate");
  if (crate && crate.url) {
    state.innerHTML = '<span class="ok">Connected</span> to your Crate.';
    where.textContent = crate.url;
  } else {
    state.textContent = "Not connected yet. In Crate, open Settings → Crate in Chrome → Connect.";
  }
})();
