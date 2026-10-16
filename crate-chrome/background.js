// Crate in Chrome: the content scripts say what each music tab is playing; this keeps the latest
// per tab, picks what is actually playing, and tells Crate every few seconds.
const EVERY_MS = 4000;
const latest = new Map(); // tabId -> { at, report }
let lastKey = null;
let lastSentAt = 0;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "now" || !sender.tab) return;
  if (msg.report) latest.set(sender.tab.id, { at: Date.now(), report: msg.report });
  else latest.delete(sender.tab.id);
});
chrome.tabs.onRemoved.addListener((tabId) => latest.delete(tabId));

async function pair() {
  const { crate } = await chrome.storage.local.get("crate");
  return crate && crate.url && crate.token ? crate : null;
}

async function tick() {
  const crate = await pair();
  if (!crate) return;
  const now = Date.now();
  let best = null;
  for (const [tabId, v] of latest) {
    if (now - v.at > 15000) {
      latest.delete(tabId);
      continue;
    }
    if (!v.report.playing) continue;
    if (!best || v.at > best.at) best = v;
  }
  const report = best ? best.report : null;
  const key = report ? `${report.source}|${report.title}|${report.artist}` : null;
  // Keep reporting while something plays (position moves); when quiet, say so once, then rarely.
  if (!report && lastKey === null && now - lastSentAt < 60000) return;
  try {
    await fetch(`${crate.url.replace(/\/$/, "")}/api/ingest/now`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${crate.token}` },
      body: JSON.stringify({ now: report ? { ...report, playing: undefined } : null }),
    });
    lastKey = key;
    lastSentAt = now;
  } catch {
    /* Crate is closed; try again next tick */
  }
}

chrome.alarms.create("crate-tick", { periodInMinutes: 0.1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "crate-tick") tick();
});
// Alarms fire at most every 30 seconds in MV3; a short loop fills the gaps while the worker is awake.
setInterval(tick, EVERY_MS);
tick();
