/**
 * End-to-end: two people, two devices, real link resolution.
 * Boots a production server on a fresh SQLite file, then drives it with Playwright.
 *
 *   npm run build && npm run e2e
 *
 * Set PLAYWRIGHT_PATH if playwright is not resolvable from this project.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
} catch {
  pw = require("/opt/npm-tools/node_modules/playwright");
}
const { chromium, devices } = pw;

const PORT = Number(process.env.E2E_PORT || 3100);
const BASE = `http://localhost:${PORT}`;
const OUT = "tests/e2e/out";
const DB = "./data/e2e.db";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const SP = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";
const AM = "https://music.apple.com/us/album/archangel/893175779?i=893175788";
const SC = "https://soundcloud.com/forss/flickermood";

function log(s) {
  console.log(`  ${s}`);
}

/** Waits for every <img> on the page to finish loading (artwork comes from CDNs). */
async function settled(page) {
  await page.evaluate(
    () =>
      Promise.all(
        Array.from(document.images)
          .filter((i) => !i.complete)
          .map((i) => new Promise((r) => (i.onload = i.onerror = r))),
      ),
  );
  await new Promise((r) => setTimeout(r, 250));
}

async function waitForServer(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  throw new Error("server did not start");
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const f of [DB, `${DB}-journal`, `${DB}-wal`, `${DB}-shm`]) if (existsSync(f)) rmSync(f);

  const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    env: {
      ...process.env,
      DATABASE_URL: `file:${DB}`,
      NEXT_PUBLIC_APP_URL: BASE,
      SESSION_SECRET: "e2e-secret-long-enough-for-production-rules",
      CRATE_TEST_HOOKS: "1",
      CRON_SECRET: "e2e-cron",
      GOOGLE_CLIENT_ID: "test-google-client",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const stopServer = () => {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  };
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  const browser = await chromium.launch();
  let failed = false;
  try {
    await waitForServer(`${BASE}/manifest.webmanifest`);
    log("server up");

    // ---- Joshua on a desktop ----
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
    const a = await desk.newPage();
    a.on("pageerror", (e) => console.error("DESKTOP PAGE ERROR:", e.message));
    await a.goto(BASE);
    await a.screenshot({ path: `${OUT}/01-welcome-desktop.png` });
    await a.locator("#start-name").fill("Joshua");
    await a.locator("#start-crew").fill("Joshua & Ariel");
    await a.getByRole("button", { name: "Start a crew" }).click();
    await a.getByRole("heading", { name: "Where do you listen?" }).waitFor({ timeout: 20000 });
    await a.screenshot({ path: `${OUT}/01b-connect-desktop.png` });
    await a.getByRole("link", { name: "Skip for now" }).click();
    await a.getByText("Nothing new.").waitFor({ timeout: 20000 });
    log("Joshua started a crew and skipped connections for now");
    const meA = await (await desk.request.get(`${BASE}/api/me`)).json();
    assert.equal(meA.me.name, "Joshua");
    const crew = meA.me.crews[0];
    assert.ok(crew.inviteCode);

    // ---- Ariel on a phone ----
    const phone = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "dark" });
    const b = await phone.newPage();
    b.on("pageerror", (e) => console.error("PHONE PAGE ERROR:", e.message));
    await b.goto(`${BASE}/join/${crew.inviteCode}`);
    await b.screenshot({ path: `${OUT}/02-invite-phone.png` });
    await b.locator("#join-name").fill("Ariel");
    await b.getByRole("button", { name: /Join Joshua & Ariel/ }).click();
    await b.getByText("Where do you listen?").waitFor({ timeout: 20000 });
    await b.getByRole("link", { name: "Skip for now" }).click();
    await b.getByText("Nothing new.").waitFor({ timeout: 20000 });
    // Mobile navigation lives in a bottom tab bar.
    await b.locator(".tabbar").waitFor();
    await b.locator(".tabbar").getByRole("link", { name: "Log" }).click();
    await b.waitForURL(/\/log/);
    await b.getByRole("heading", { name: "Log" }).waitFor();
    await b.locator(".tabbar").getByRole("link", { name: "Playlist" }).click();
    await b.waitForURL(`${BASE}/`);
    log("Ariel joined from the invite link; the phone tab bar navigates");

    // Ariel is a DJ.
    await b.goto(`${BASE}/settings`);
    await b.getByRole("switch", { name: "I DJ" }).click();
    await b.getByText("Saved").waitFor();
    await b.screenshot({ path: `${OUT}/03-settings-phone.png`, fullPage: true });
    const meB = await (await phone.request.get(`${BASE}/api/me`)).json();
    assert.equal(meB.me.isDj, true);
    assert.equal(meB.me.crews[0].members.length, 2);

    // ---- Ariel sends three links from her phone ----
    await b.goto(BASE);
    async function sendFromPhone(url, note) {
      await b.getByRole("button", { name: "Send a track" }).click();
      await b.getByLabel("Link or search").fill(url);
      await b.getByText("Ready to send").waitFor({ timeout: 30000 });
      if (note) await b.getByRole("textbox", { name: /A line for/ }).fill(note);
      return b;
    }
    await sendFromPhone(YT, "this one for the drive");
    await settled(b);
    await b.screenshot({ path: `${OUT}/04-send-ready-phone.png` });
    await b.getByRole("button", { name: "Send", exact: true }).click();
    await b.getByText("Sent to Joshua").last().waitFor();
    log("Ariel sent a YouTube link");
    await sendFromPhone(SP, "");
    await b.getByRole("button", { name: "Send", exact: true }).click();
    await b.getByText("Sent to Joshua").last().waitFor();
    log("Ariel sent a Spotify link (agent note)");
    await sendFromPhone(AM, "");
    await b.getByRole("button", { name: "Send", exact: true }).click();
    await b.getByText("Sent to Joshua").last().waitFor();
    log("Ariel sent an Apple Music link");

    // Sanity on what the resolver stored.
    const sendsForA = await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=reel`)).json();
    assert.equal(sendsForA.sends.length, 3);
    const [s1, s2, s3] = sendsForA.sends;
    assert.equal(s1.track.title, "Never Gonna Give You Up");
    assert.equal(s1.track.artist, "Rick Astley");
    assert.equal(s1.note, "this one for the drive");
    assert.equal(s1.noteBy, "human");
    assert.ok(s1.track.previewUrl, "youtube send has a preview");
    assert.ok(s1.track.artworkUrl, "youtube send has artwork");
    assert.ok(s1.track.links.youtube.direct, "youtube link kept as direct");
    assert.equal(s2.track.title, "Never Gonna Give You Up");
    assert.equal(s2.track.id, s1.track.id, "same song from two platforms is one track");
    assert.equal(s2.noteBy, "agent");
    assert.ok(s2.note && s2.note.length > 0, "agent wrote a note");
    assert.ok(s2.track.links.spotify.direct, "spotify direct link merged onto the shared track");
    assert.equal(s3.track.artist, "Burial");
    assert.equal(s3.track.title, "Archangel");
    assert.ok(s3.track.accent && /^#[0-9a-f]{6}$/.test(s3.track.accent), "accent sampled");
    assert.equal(s3.history.length, 0);
    log("resolver output checked (dedupe, notes, links, accent)");

    // ---- Joshua sends one back (SoundCloud) ----
    await a.reload();
    await a.getByText("3 left").waitFor({ timeout: 20000 });
    await a.keyboard.press("Meta+k");
    await a.getByLabel("Link or search").fill(SC);
    await a.getByText("Ready to send").waitFor({ timeout: 30000 });
    await a.getByRole("textbox", { name: /A line for/ }).fill("late night, maybe an opener");
    await a.getByRole("button", { name: "Send", exact: true }).click();
    await a.getByText("Sent to Ariel").last().waitFor();
    log("Joshua sent a SoundCloud link with Cmd+K");
    const arielReel = await (await phone.request.get(`${BASE}/api/sends?crew=${crew.id}&view=reel`)).json();
    const scSend = arielReel.sends.find((x) => x.track.title === "Flickermood");
    assert.ok(scSend, "SoundCloud send reached Ariel");
    assert.ok(/sndcdn\.com/.test(scSend.track.artworkUrl ?? ""), `SoundCloud link keeps its own artwork, got ${scSend.track.artworkUrl}`);
    assert.ok(scSend.track.previewUrl, "catalog preview still attached");

    // ---- Joshua's reel on desktop ----
    await a.reload();
    await a.getByText("3 left").waitFor({ timeout: 20000 });
    await a.getByRole("heading", { name: "Never Gonna Give You Up" }).first().waitFor();
    await a.getByText("this one for the drive").first().waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/05-reel-desktop.png` });
    // Keep with the keyboard, then next.
    await a.keyboard.press("s");
    await a.getByText("Kept").first().waitFor();
    await a.getByText("2 left").waitFor({ timeout: 10000 });
    await a.keyboard.press("j");
    await a.getByText("1 left").waitFor({ timeout: 10000 });
    await a.getByRole("heading", { name: "Archangel" }).first().waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/06-reel-desktop-burial.png` });
    // Reply on the card panel.
    await a.getByLabel("Reply").first().fill("yes. this.");
    await a.getByLabel("Reply").first().press("Enter");
    await a.getByText("Sent back").waitFor();
    await a.getByLabel("Reply").first().blur();
    await a.keyboard.press("j");
    // The stage ran dry, so the page becomes the playlist itself, under the agent's name.
    await a.locator(".pl__list").waitFor({ timeout: 10000 });
    assert.ok((await a.locator(".pl__name").textContent())?.trim().length, "the playlist has a name");
    await settled(a);
    await a.screenshot({ path: `${OUT}/06b-playlist-desktop.png` });
    log("Joshua kept one, skipped one, replied, and emptied the stage into the playlist");

    const reelAfter = await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=reel`)).json();
    assert.equal(reelAfter.sends.length, 0);
    const crateA = await (await desk.request.get(`${BASE}/api/crate`)).json();
    assert.equal(crateA.sends.length, 1);
    assert.equal(crateA.sends[0].reaction.status, "saved");

    await a.goto(`${BASE}/crate`);
    await a.waitForURL(/\/log\?filter=kept/);
    await a.getByText("Never Gonna Give You Up").first().waitFor();
    await a.getByText(/kept · from Ariel/).first().waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/07-log-kept-desktop.png` });
    log("Crate renders for Joshua");

    // ---- Ariel's reel on the phone ----
    await b.goto(BASE);
    await b.getByText("1 left").waitFor({ timeout: 20000 });
    await b.getByRole("heading", { name: "Flickermood" }).waitFor();
    await b.getByText("late night, maybe an opener").waitFor();
    await settled(b);
    await b.screenshot({ path: `${OUT}/09-reel-phone.png` });
    // Open the card with the on-screen "Keep" button's neighbour: long-press is a gesture, so use the Enter key path on the sheet instead.
    await b.getByRole("button", { name: /Played out/ }).waitFor();
    // Swipe up = next, swipe right = keep. Use a touch drag to the right to keep.
    const cover = b.locator(".cover").first();
    const box = await cover.boundingBox();
    assert.ok(box);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await b.mouse.move(cx, cy);
    await b.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await b.mouse.move(cx + i * 22, cy + i * 2);
      await sleep(16);
    }
    await b.screenshot({ path: `${OUT}/10-reel-phone-swiping.png` });
    await b.mouse.up();
    await b.getByText("Kept").first().waitFor();
    await b.locator(".pl__list").waitFor({ timeout: 10000 });
    log("Ariel kept Joshua's send with a swipe");

    await b.goto(`${BASE}/log?filter=kept`);
    await b.getByText("Flickermood").first().waitFor();
    await b.getByText(/kept · from Joshua/).first().waitFor();
    await b.locator(".log__row").first().click();
    await b.getByRole("dialog").getByText("From Joshua").waitFor();
    await b.getByRole("dialog").getByRole("button", { name: /Played it out/ }).click();
    await b.getByText("Marked as played out").last().waitFor();
    await b.getByRole("dialog").getByRole("button", { name: "Played out", exact: true }).waitFor();
    await settled(b);
    await b.screenshot({ path: `${OUT}/11-track-sheet-phone.png` });
    await b.keyboard.press("Escape");
    await b.getByText(/played out · from Joshua/).first().waitFor();
    log("Ariel marked it played out from the Log");

    // ---- analysis endpoint ----
    const put = await phone.request.put(`${BASE}/api/tracks/${s3.track.id}/analysis`, {
      data: { bpm: 138.2, keyName: "A minor", camelot: "8A", energy: 7 },
    });
    assert.equal(put.status(), 200);
    const putJson = await put.json();
    assert.equal(putJson.track.camelot, "8A");
    assert.equal(putJson.track.bpm, 138.2);
    const bad = await phone.request.put(`${BASE}/api/tracks/${s3.track.id}/analysis`, { data: { bpm: 9000, keyName: "nope" } });
    assert.equal(bad.status(), 400);
    log("analysis endpoint validates and saves");

    // ---- other platforms resolve without errors (soft: these sites may block bots) ----
    for (const url of [
      "https://www.deezer.com/en/track/3135556",
      "https://burial.bandcamp.com/track/archangel",
      "https://www.beatport.com/track/archangel/1234567",
      "https://tidal.com/browse/track/5486982",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://example.com/not-music",
    ]) {
      const r = await phone.request.post(`${BASE}/api/resolve`, { data: { url } });
      assert.equal(r.status(), 200, `resolve ${url}`);
      const j = await r.json();
      assert.ok(j.track && j.track.title, `title for ${url}`);
      log(`resolved ${url} -> ${j.track.artist ? j.track.artist + " - " : ""}${j.track.title}${j.resolved ? "" : " (bare)"}`);
    }

    // ---- in-browser audio analysis on an MP3 preview (Chromium decodes MP3; AAC needs Chrome/Safari) ----
    // Deezer sometimes answers with an HTML wall from a datacenter; the analysis check is skipped then, not failed.
    const dz = await fetch("https://api.deezer.com/search?q=" + encodeURIComponent("daft punk around the world") + "&limit=1")
      .then((r) => r.json())
      .catch(() => null);
    const mp3 = dz?.data?.[0]?.preview;
    if (mp3) {
      const ts = require("typescript");
      const { readFileSync } = await import("node:fs");
      const src = readFileSync("src/lib/audio/dsp.ts", "utf8");
      const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
      const analysis = await b.evaluate(
        async ({ js, url }) => {
          const exports = {};
          new Function("exports", js)(exports);
          const r = await fetch(`/api/preview?u=${encodeURIComponent(url)}`);
          const buf = await r.arrayBuffer();
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(buf);
          const chans = [];
          for (let c = 0; c < decoded.numberOfChannels; c++) chans.push(decoded.getChannelData(c));
          const pcm = exports.toMono(chans);
          const out = exports.analyzePcm(pcm, decoded.sampleRate);
          await ctx.close();
          return { ...out, seconds: decoded.duration };
        },
        { js, url: mp3 },
      );
      assert.ok(analysis.seconds > 20, "decoded a full preview");
      assert.ok(analysis.bpm > 100 && analysis.bpm < 140, `Around the World ~121 BPM, got ${analysis.bpm}`);
      assert.ok(/^[A-G]#? (major|minor)$/.test(analysis.keyName));
      log(`browser analysis: ${analysis.bpm} BPM, ${analysis.keyName} (${analysis.camelot}), energy ${analysis.energy}`);
    } else {
      log("skipped browser analysis (no Deezer preview available)");
    }

    // ---- share target + search + unsend ----
    await b.goto(`${BASE}/send?url=${encodeURIComponent(YT)}`);
    await b.getByText("Ready to send").waitFor({ timeout: 30000 });
    await b.getByText("Sending as a bare link").count(); // either state is fine
    await b.keyboard.press("Escape");
    await b.getByRole("button", { name: "Send a track" }).click();
    await b.getByLabel("Link or search").fill("burial archangel");
    await b.locator(".result").first().waitFor({ timeout: 20000 });
    await b.screenshot({ path: `${OUT}/13-search-phone.png` });
    await b.locator(".result").first().click();
    await b.getByText("Ready to send").waitFor({ timeout: 30000 });
    await b.getByRole("button", { name: "Send", exact: true }).click();
    await b.getByText("Sent to Joshua").last().waitFor();
    await b.getByRole("button", { name: "Undo" }).click();
    await b.getByText("Unsent").last().waitFor();
    const reelA2 = await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=reel`)).json();
    assert.equal(reelA2.sends.length, 0, "undo removed the send");
    log("share target, catalog search and undo work");

    // ---- auth boundaries ----
    const anon = await browser.newContext();
    const r401 = await anon.request.get(`${BASE}/api/crate`);
    assert.equal(r401.status(), 401);
    const r404 = await anon.request.post(`${BASE}/api/join`, { data: { code: "nope", yourName: "X" } });
    assert.equal(r404.status(), 404);
    const bogus = await phone.request.get(`${BASE}/api/sends?crew=c_nope&view=reel`);
    assert.equal(bogus.status(), 403);
    const ownReact = await phone.request.post(`${BASE}/api/sends/${s1.id}/react`, { data: { status: "saved" } });
    assert.equal(ownReact.status(), 400, "cannot react to your own send");
    const proxyBad = await phone.request.get(`${BASE}/api/preview?u=${encodeURIComponent("https://example.com/x.mp3")}`);
    assert.equal(proxyBad.status(), 403);
    const proxyOk = await phone.request.get(`${BASE}/api/preview?u=${encodeURIComponent(s1.track.previewUrl)}`);
    assert.equal(proxyOk.status(), 200);
    assert.ok((await proxyOk.body()).length > 50000, "preview proxied");
    await anon.close();
    log("auth and proxy boundaries hold");


    // ================= Sources, crew rules, iMessage ingest, Log =================

    // The maker registers Spotify once on /setup; after that everyone just taps Connect.
    await a.goto(`${BASE}/setup`);
    await a.getByText("One-time setup").waitFor();
    await a.locator(".source").filter({ hasText: "Spotify" }).getByRole("button", { name: "Set up" }).click();
    await a.getByText("127.0.0.1").first().waitFor(); // the redirect URI to register
    await a.getByLabel("Client ID").fill("test-spotify-client");
    await a.getByRole("button", { name: "Save", exact: true }).click();
    await a.getByText("Spotify is set up").waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/15b-setup-desktop.png`, fullPage: true });
    const keysNow = await (await desk.request.get(`${BASE}/api/keys`)).json();
    assert.equal(keysNow.present.SPOTIFY_CLIENT_ID, true);
    assert.equal(keysNow.present.GOOGLE_CLIENT_SECRET, true, "env keys count too");
    assert.equal(keysNow.present.APPLE_KEY_ID, false);
    log("Spotify registered once on the setup page");

    // Consumer side: Settings → Where you listen → tap Spotify → straight to Spotify's consent page.
    await a.goto(`${BASE}/settings`);
    await a.getByText("Where you listen").waitFor();
    assert.equal(await a.getByText("ListenBrainz").count(), 0);
    // Apple Music has no account link without the maker's keys; the row points at the Mac helper instead of a dead button.
    await a.getByRole("button", { name: "How to bring in Apple Music" }).isEnabled().then((e) => assert.ok(e, "Apple's row sends people to Crate on your Mac"));
    assert.equal(await a.getByText("On a Mac").count(), 1);
    await a.getByRole("button", { name: "Connect YouTube" }).isEnabled().then((e) => assert.ok(e, "YouTube (env keys) is tappable"));
    await settled(a);
    await a.screenshot({ path: `${OUT}/15-settings-desktop.png`, fullPage: true });
    await a.route("https://accounts.spotify.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>spotify stub" }));
    await a.getByRole("button", { name: "Connect Spotify" }).click();
    await a.waitForURL(/accounts\.spotify\.com/, { timeout: 20000 });
    let spUrl = new URL(a.url());
    if (spUrl.searchParams.get("continue")) spUrl = new URL(spUrl.searchParams.get("continue"));
    assert.equal(spUrl.searchParams.get("client_id"), "test-spotify-client");
    assert.ok(spUrl.searchParams.get("code_challenge"), "pkce challenge");
    assert.ok(spUrl.searchParams.get("redirect_uri").startsWith("http://127.0.0.1:"), "spotify loopback redirect");
    await a.unroute("https://accounts.spotify.com/**");
    log("one tap on Spotify goes straight to Spotify's consent page with PKCE");

    const ytRedir = await desk.request.get(`${BASE}/api/connect/youtube`, { maxRedirects: 0 });
    assert.equal(ytRedir.status(), 307);
    assert.equal(new URL(ytRedir.headers()["location"]).hostname, "accounts.google.com");
    const badState = await desk.request.get(`${BASE}/api/connect/spotify/callback?code=x&state=bogus`, { maxRedirects: 0 });
    assert.equal(badState.status(), 307);
    assert.ok(badState.headers()["location"].includes("error=state"));
    const anonConnect = await browser.newContext();
    const anonRedir = await anonConnect.request.get(`${BASE}/api/connect/spotify`, { maxRedirects: 0 });
    assert.ok(anonRedir.headers()["location"].includes("connect=signin"));
    const anonKeys = await anonConnect.request.get(`${BASE}/api/keys`);
    assert.equal(anonKeys.status(), 401);
    await anonConnect.close();
    const scNeeds = await desk.request.get(`${BASE}/api/connect/soundcloud`, { maxRedirects: 0 });
    assert.equal(scNeeds.status(), 501);
    log("connect flows redirect correctly; unset connectors answer 501");

    // Theme: one tap flips it and it sticks.
    await a.goto(`${BASE}/settings`);
    assert.equal(await a.evaluate(() => document.documentElement.getAttribute("data-theme")), null);
    await a.getByRole("radio", { name: "Light" }).click();
    assert.equal(await a.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
    await a.reload();
    assert.equal(await a.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
    await a.getByRole("radio", { name: "Dark" }).click();
    assert.equal(await a.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
    await a.getByRole("radio", { name: "Auto" }).click();
    assert.equal(await a.evaluate(() => document.documentElement.getAttribute("data-theme")), null);
    // The crew page: people, invite, the playlist name, rules, public radio; leaving asks first.
    await a.goto(`${BASE}/crew`);
    await a.getByRole("textbox", { name: "Crew name" }).waitFor();
    await a.getByText("Ariel", { exact: true }).waitFor();
    await a.getByRole("button", { name: "Copy invite link" }).waitFor();
    await a.waitForFunction(() => !!document.querySelector('input[aria-label="Playlist name"]')?.value, null, { timeout: 20000 });
    await a.getByRole("textbox", { name: "Playlist name" }).fill("Late shift");
    await a.getByRole("button", { name: "Rename" }).click();
    await a.getByText("Renamed").waitFor();
    await a.getByText(/You named it/).waitFor();
    await a.getByRole("switch", { name: "Public radio" }).click();
    await a.getByText("On air").waitFor();
    const radioLink = await a.getByRole("link", { name: "Open the station" }).getAttribute("href");
    assert.ok(radioLink && /\/radio\/[a-z0-9]+$/.test(radioLink), "a station link exists");
    await a.getByRole("button", { name: "Leave this crew" }).click();
    await a.getByText(/Leave Joshua & Ariel\?/).waitFor();
    await a.getByRole("button", { name: "Cancel" }).click();
    await settled(a);
    await a.screenshot({ path: `${OUT}/15c-crew-desktop.png`, fullPage: true });
    // The station opens with no account at all.
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto(radioLink);
    await anonPage.getByRole("heading", { name: "Late shift" }).waitFor({ timeout: 15000 });
    await anonPage.getByText("The playlist").waitFor();
    await anonPage.locator(".pl__row").first().waitFor();
    const anonBad = await anonCtx.request.get(`${BASE}/api/radio/nope`);
    assert.equal(anonBad.status(), 404);
    await settled(anonPage);
    await anonPage.screenshot({ path: `${OUT}/15d-radio-anon.png` });
    await anonCtx.close();
    // Home shows the playlist under its new name.
    await a.goto(BASE);
    await a.locator(".pl__name", { hasText: "Late shift" }).waitFor();
    const syncRes = await desk.request.post(`${BASE}/api/sync`, { data: {} });
    assert.equal(syncRes.status(), 200);
    log("theme toggle sticks across reloads; the crew page renames, opens a public station, and leave asks first");

    // Ariel's rule on the crew page: everything she plays lands here by default; she narrows it to likes.
    await b.goto(`${BASE}/crew`);
    await b.getByRole("radio", { name: "Everything I play" }).waitFor();
    assert.equal(await b.getByRole("radio", { name: "Everything I play" }).getAttribute("aria-checked"), "true", "plays land in the playlist by default");
    await b.getByRole("radio", { name: "Just my likes" }).click();
    await b.getByText("Just your likes will land here").waitFor();
    const nowMs = Date.now();
    const fakeLike = await phone.request.post(`${BASE}/api/test/items`, {
      data: {
        kind: "spotify",
        items: [
          {
            externalId: "sp-one-more-time",
            action: "liked",
            at: nowMs,
            meta: {
              artist: "Daft Punk",
              title: "One More Time",
              album: "Discovery",
              direct: { spotify: "https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV" },
              sourcePlatform: "spotify",
              sourceUrl: "https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV",
            },
          },
        ],
      },
    });
    assert.equal(fakeLike.status(), 200);
    const fakeLikeJson = await fakeLike.json();
    assert.equal(fakeLikeJson.added, 1);
    assert.equal(fakeLikeJson.shared, 1, "a like became a send");
    // Same like again is a no-op.
    const again = await (await phone.request.post(`${BASE}/api/test/items`, { data: { kind: "spotify", items: [{ externalId: "sp-one-more-time", action: "liked", at: nowMs, meta: { artist: "Daft Punk", title: "One More Time", direct: {}, sourcePlatform: "spotify", sourceUrl: "https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV" } }] } })).json();
    assert.equal(again.added, 0);
    await a.goto(BASE);
    await a.getByRole("heading", { name: "One More Time" }).first().waitFor({ timeout: 20000 });
    await a.getByText(/liked on Spotify/).first().waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/16-reel-autoshare-desktop.png` });
    log("Ariel's Spotify like arrived in Joshua's reel as a send");
    await b.goto(`${BASE}/log`);
    // One listen, one row: the like, with the crew it was carried into as its detail.
    await b.getByText(/liked · Spotify → Joshua & Ariel/).first().waitFor();
    assert.equal(await b.getByText(/liked on Spotify → Joshua & Ariel/).count(), 0, "the carried send is not a second row");
    await b.getByText(/This week: 1 like from Spotify/).waitFor();
    await settled(b);
    await b.screenshot({ path: `${OUT}/17-log-phone.png`, fullPage: true });
    log("Ariel's Log shows the like once, with where it went");

    // Joshua's rule is still "everything I play": his plays stream into the playlist, each track once.
    const plays = await desk.request.post(`${BASE}/api/test/items`, {
      data: {
        kind: "apple",
        items: [1, 2, 3].map((n) => ({
          externalId: `play-${n}`,
          action: "played",
          at: nowMs - n * 1000,
          meta: { artist: "Burial", title: "Near Dark", direct: {}, sourcePlatform: "apple", sourceUrl: "https://music.apple.com/us/album/untrue/893175779" },
        })),
      },
    });
    const playsJson = await plays.json();
    assert.equal(playsJson.added, 1, "three reports of one listen, seconds apart, are one play");
    assert.equal(playsJson.shared, 1, "a played track lands in the playlist once, not once per play");
    const playSend = (await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=all`)).json()).sends.find((x) => x.track.title === "Near Dark");
    assert.equal(playSend?.via, "played:apple");
    await a.goto(`${BASE}/log`);
    await a.getByText(/played · Apple Music → Joshua & Ariel/).first().waitFor();
    assert.equal(await a.getByText(/played on Apple Music → Joshua & Ariel/).count(), 0, "one row per listen");
    log("Joshua's Apple Music play streamed into the crew playlist on its own");

    // Ariel likes the same track later (her rule is likes only): not a second row, an echo on Joshua's, and the row floats up.
    const echoed = await (
      await phone.request.post(`${BASE}/api/test/items`, {
        data: {
          kind: "spotify",
          items: [{ externalId: "sp-near-dark", action: "liked", at: Date.now(), meta: { artist: "Burial", title: "Near Dark", direct: {}, sourcePlatform: "spotify", sourceUrl: "https://open.spotify.com/track/near-dark" } }],
        },
      })
    ).json();
    assert.equal(echoed.shared, 1, "a like of a track already here counts as an echo");
    const afterEcho = (await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=all`)).json()).sends;
    assert.equal(afterEcho.filter((x) => x.track.title === "Near Dark").length, 1, "still one row for the track");
    assert.equal(afterEcho[0].track.title, "Near Dark", "the echoed track is back on top");
    assert.equal(afterEcho[0].echoes.length, 1);
    assert.equal(afterEcho[0].echoes[0].person.name, "Ariel");
    assert.equal(afterEcho[0].echoes[0].via, "spotify");
    await a.goto(BASE);
    await a.getByRole("button", { name: "Show the playlist" }).click();
    await a.getByRole("tab", { name: /Ariel/ }).click();
    await a.locator(".pl__row", { hasText: "Near Dark" }).locator(".faces.is-many").waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/24-playlist-people-desktop.png` });
    await a.locator(".pl__row", { hasText: "Near Dark" }).click();
    await a.getByText(/Ariel liked it too on Spotify/).waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/24b-playlist-track-desktop.png` });
    await a.keyboard.press("Escape");
    log("the playlist shows whose track it is, filters by person, and a shared play shows both faces");

    // Live: Joshua's player reports a preview; Ariel sees it spinning on Live and as a band on her Reel.
    const allSends = await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=all`)).json();
    const liveTrack = allSends.sends.find((s) => s.track.title === "Archangel")?.track ?? allSends.sends[0].track;
    const noTrack = await desk.request.post(`${BASE}/api/live`, { data: { playing: true } });
    assert.equal(noTrack.status(), 400);
    const beat = await desk.request.post(`${BASE}/api/live`, { data: { trackId: liveTrack.id, playing: true, progressMs: 12000, durationMs: 30000 } });
    assert.equal(beat.status(), 200);
    const liveJson = await (await phone.request.get(`${BASE}/api/live?crew=${crew.id}`)).json();
    const joshLive = liveJson.people.find((p) => p.person.name === "Joshua");
    assert.ok(joshLive?.live, "Joshua shows as live");
    assert.equal(joshLive.source, "crate");
    assert.equal(joshLive.title, liveTrack.title);
    await b.goto(`${BASE}/live`);
    await b.getByText("1 playing").waitFor({ timeout: 15000 });
    await b.locator(".orb.is-live").first().waitFor();
    await b.getByText(liveTrack.title).first().waitFor();
    await settled(b);
    await b.screenshot({ path: `${OUT}/19-live-phone.png` });
    await b.locator(".orb.is-live.is-spinning").first().waitFor();
    // Tapping the record stops it; tapping the words opens the sheet.
    await b.locator(".orb.is-live .orb__stage").first().click();
    await b.locator(".orb.is-live:not(.is-spinning)").first().waitFor();
    await b.locator(".orb.is-live .orb__stage").first().click();
    await b.locator(".orb.is-live.is-spinning").first().waitFor();
    await b.locator(".orb.is-live .orb__text").first().click();
    await b.getByText(/Joshua is playing/).waitFor();
    await b.keyboard.press("Escape");
    // Follow along: without a Spotify of her own, Ariel is told what it would take.
    await b.getByRole("button", { name: "Follow along" }).first().waitFor();
    const followNo = await phone.request.post(`${BASE}/api/live/follow`, { data: { crew: crew.id, userId: meA.me.id } });
    assert.equal(followNo.status(), 409);
    assert.match((await followNo.json()).error, /Connect Spotify/);
    const followSelf = await desk.request.post(`${BASE}/api/live/follow`, { data: { crew: crew.id, userId: meA.me.id } });
    assert.equal(followSelf.status(), 400);
    await b.goto(BASE);
    await b.locator(".liveband").waitFor({ timeout: 15000 });
    await b.getByText(/is playing/).first().waitFor();
    await a.goto(`${BASE}/live`);
    await a.locator(".orb.is-me.is-live").waitFor({ timeout: 15000 });
    // Both of them have Live open: that counts as two tuned in. The session shows under Earlier.
    await b.goto(`${BASE}/live`);
    await b.locator(".orb.is-live").first().waitFor({ timeout: 15000 });
    const tuned = await (await phone.request.get(`${BASE}/api/live?crew=${crew.id}&tune=1&history=1`)).json();
    assert.ok(tuned.tunedIn >= 2, "both of them count as tuned in");
    assert.ok(tuned.history.length >= 1, "the session is remembered");
    await a.reload();
    await a.getByText(/\d+ tuned in/).waitFor({ timeout: 15000 });
    await a.locator(".lh__row").first().waitFor();
    await a.getByText("Today", { exact: true }).waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/20-live-desktop.png` });
    log("Live shows what Joshua is playing, and Ariel's Reel carries the band");
    // Paused: no longer live, but still the last thing played.
    await desk.request.post(`${BASE}/api/live`, { data: { trackId: liveTrack.id, playing: false, progressMs: 15000, durationMs: 30000 } });
    const pausedJson = await (await phone.request.get(`${BASE}/api/live?crew=${crew.id}`)).json();
    assert.equal(pausedJson.people.find((p) => p.person.name === "Joshua").live, false);

    // Pocket mode: the whole app on a handheld with a wheel.
    await a.goto(BASE);
    await a.getByRole("button", { name: "Pocket mode" }).click();
    await a.getByRole("dialog", { name: "Pocket player" }).waitFor();
    await a.getByRole("option", { name: /^Playlist/ }).waitFor();
    await a.keyboard.press("Enter");
    await a.locator(".lcd__title", { hasText: "Playlist" }).waitFor();
    await a.locator(".lcd__row:not(.is-dim)").first().waitFor();
    await a.keyboard.press("ArrowDown");
    await a.keyboard.press("Enter");
    await a.locator(".lcd__title", { hasText: "Now Playing" }).waitFor();
    await a.locator(".lcd__nowtitle").waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/21-pocket-desktop.png` });
    await a.keyboard.press("Backspace");
    await a.locator(".lcd__title", { hasText: "Playlist" }).waitFor();
    await a.getByRole("button", { name: "Back", exact: true }).click();
    await a.getByRole("option", { name: /^Live/ }).waitFor();
    await a.keyboard.press("Escape");
    await a.getByRole("dialog", { name: "Pocket player" }).waitFor({ state: "detached" });
    await a.reload();
    await a.getByRole("dialog", { name: "Pocket player" }).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    assert.equal(await a.getByRole("dialog", { name: "Pocket player" }).count(), 0, "pocket mode stays off after exit");
    await b.goto(BASE);
    await b.getByRole("link", { name: "You and settings" }).click();
    await b.getByRole("button", { name: "Open", exact: true }).click();
    await b.getByRole("dialog", { name: "Pocket player" }).waitFor();
    await settled(b);
    await b.screenshot({ path: `${OUT}/22-pocket-phone.png` });
    await b.getByRole("button", { name: "Back to Crate" }).first().click();
    await b.getByRole("dialog", { name: "Pocket player" }).waitFor({ state: "detached" });
    log("Pocket mode drives the reel from the wheel and the keyboard, on desktop and phone");

    // iMessage ingest: unknown handle lands in the reel as received.
    const tokenRes = await (await desk.request.get(`${BASE}/api/ingest/token`)).json();
    assert.ok(tokenRes.token.startsWith("crate_"));
    const ingestCtx = await browser.newContext();
    const badTok = await ingestCtx.request.post(`${BASE}/api/ingest`, { headers: { authorization: "Bearer crate_nope" }, data: { url: YT } });
    assert.equal(badTok.status(), 401);
    const ing1 = await ingestCtx.request.post(`${BASE}/api/ingest`, {
      headers: { authorization: `Bearer ${tokenRes.token}` },
      data: { text: `you need this https://www.youtube.com/watch?v=dQw4w9WgXcQ`, from: "+1 (415) 555-0100", at: nowMs },
    });
    assert.equal(ing1.status(), 200);
    const ing1Json = await ing1.json();
    assert.equal(ing1Json.outcome.kind, "received");
    const ing1dup = await (await ingestCtx.request.post(`${BASE}/api/ingest`, { headers: { authorization: `Bearer ${tokenRes.token}` }, data: { text: `again https://www.youtube.com/watch?v=dQw4w9WgXcQ`, from: "+14155550100" } })).json();
    assert.equal(ing1dup.outcome.kind, "duplicate");
    await a.goto(BASE);
    await a.getByText(/via iMessage/).first().waitFor({ timeout: 20000 });
    await a.getByText("you need this").first().waitFor();
    await settled(a);
    await a.screenshot({ path: `${OUT}/18-reel-imessage-desktop.png` });
    // Keep it with the keyboard; it must show in the Log as kept.
    await a.keyboard.press("s");
    await a.getByText("Kept").first().waitFor();
    await a.goto(`${BASE}/log?filter=kept`);
    await a.getByText(/kept · from \+14155550100/).first().waitFor();
    log("iMessage link from an unknown number landed in the reel and could be kept");

    // Ariel sets her handle; her texted links become her sends.
    await b.goto(`${BASE}/settings`);
    await b.getByText("iMessage on your Mac").click();
    await b.getByLabel("Your iMessage handle").fill("415-555-0100");
    await b.getByLabel("Your iMessage handle").press("Enter");
    await b.getByText("Saved").last().waitFor();
    const ing2 = await (await ingestCtx.request.post(`${BASE}/api/ingest`, {
      headers: { authorization: `Bearer ${tokenRes.token}` },
      data: { text: `for your set ${SC}`, from: "+14155550100", at: nowMs },
    })).json();
    assert.equal(ing2.outcome.kind, "send");
    assert.equal(ing2.outcome.fromName, "Ariel");
    await a.goto(BASE);
    await a.getByText(/Ariel · via iMessage/).first().waitFor({ timeout: 20000 });
    await a.getByText("for your set").first().waitFor();
    // Crate on your Mac: the helper says the Music app is 45 seconds into a song. Live follows at once;
    // past half a minute it is a play, logged under Apple Music.
    const macBad = await ingestCtx.request.post(`${BASE}/api/ingest/now`, { headers: { authorization: "Bearer crate_nope" }, data: { now: null } });
    assert.equal(macBad.status(), 401);
    // The helper posts the AppleScript's raw lines as text; the installer it came from is a bash script with the token baked in.
    const installer = await ingestCtx.request.get(`${BASE}/api/mac/install?key=${tokenRes.token}`);
    assert.equal(installer.status(), 200);
    const installerText = await installer.text();
    assert.ok(installerText.startsWith("#!/bin/bash") && installerText.includes(tokenRes.token) && installerText.includes("launchctl bootstrap"));
    assert.equal((await ingestCtx.request.get(`${BASE}/api/mac/install?key=crate_nope`)).status(), 401);
    const mac1 = await ingestCtx.request.post(`${BASE}/api/ingest/now`, {
      headers: { authorization: `Bearer ${tokenRes.token}`, "content-type": "text/plain; charset=utf-8" },
      data: "apple\tUntrue\tBurial\tUntrue\t263\t45\t\n",
    });
    assert.equal(mac1.status(), 200);
    const macLive = (await (await phone.request.get(`${BASE}/api/live?crew=${crew.id}`)).json()).people.find((p) => p.person.name === "Joshua");
    assert.ok(macLive?.live, "Joshua is live from the Mac helper");
    assert.equal(macLive.source, "apple");
    assert.equal(macLive.title, "Untrue");
    assert.equal(macLive.durationMs, 263000);
    const macLog = (await (await desk.request.get(`${BASE}/api/log`)).json()).items.find((i) => i.action === "played" && i.track.title === "Untrue");
    assert.ok(macLog, "the play reached the Log");
    assert.equal(macLog.source, "apple");
    // The same listen reported again (the helper ticks every few seconds, Apple's own history later) stays one play.
    await ingestCtx.request.post(`${BASE}/api/ingest/now`, {
      headers: { authorization: `Bearer ${tokenRes.token}` },
      data: { now: { source: "apple", title: "Untrue", artist: "Burial", album: "Untrue", durationMs: 263000, positionMs: 52000 } },
    });
    const twin = await (await desk.request.post(`${BASE}/api/test/items`, {
      data: { kind: "apple", items: [{ externalId: "untrue@later", action: "played", at: Date.now() - 60000, meta: { artist: "Burial", title: "Untrue", direct: {}, sourcePlatform: "apple", sourceUrl: "https://music.apple.com/us/album/untrue/893175779" } }] },
    })).json();
    assert.equal(twin.added, 0, "Apple's own report of the same listen is not a second play");
    // The one-double-click setup is a Terminal settings file that runs the same line.
    const term = await desk.request.get(`${BASE}/api/mac/terminal`);
    assert.equal(term.status(), 200);
    assert.ok((term.headers()["content-disposition"] ?? "").includes(".terminal"));
    assert.ok((await term.text()).includes(`authorization: Bearer ${tokenRes.token}`));
    // An app that refuses the helper becomes a notice under the bell, and clears once it answers.
    await ingestCtx.request.post(`${BASE}/api/ingest/now`, {
      headers: { authorization: `Bearer ${tokenRes.token}`, "content-type": "text/plain" },
      data: "err\tGoogle Chrome\tNot authorized to send Apple events to Google Chrome. (-1743)\n",
    });
    const blocked = (await (await desk.request.get(`${BASE}/api/notices`)).json()).notices;
    assert.ok(blocked.some((n) => n.title === "Crate on your Mac cannot see Google Chrome"), "the refusal shows under the bell");
    const macStop = await ingestCtx.request.post(`${BASE}/api/ingest/now`, { headers: { authorization: `Bearer ${tokenRes.token}`, "content-type": "text/plain" }, data: "" });
    assert.equal(macStop.status(), 200);
    const unblocked = (await (await desk.request.get(`${BASE}/api/notices`)).json()).notices;
    assert.ok(!unblocked.some((n) => n.id.startsWith("mac:")), "a clean report clears it");
    const macQuiet = (await (await phone.request.get(`${BASE}/api/live?crew=${crew.id}`)).json()).people.find((p) => p.person.name === "Joshua");
    assert.equal(macQuiet.live, false, "stopped on the Mac means quiet on Live");
    await ingestCtx.close();
    log("a texted link from Ariel's number became her send in the crew; the Mac helper lights up Live and logs the play once");

    // Wrong version or artwork: pick another catalog version from the Log sheet.
    await a.goto(`${BASE}/log?filter=kept`);
    await a.locator(".log__row").filter({ hasText: "Never Gonna Give You Up" }).first().click();
    await a.getByRole("dialog").waitFor();
    await a.getByRole("button", { name: "Wrong version or artwork?" }).click();
    await a.getByText("Pick the right one").waitFor({ timeout: 30000 });
    const firstPick = a.getByRole("dialog").locator(".result").first();
    await firstPick.waitFor();
    await firstPick.click();
    await a.getByText("Updated").last().waitFor({ timeout: 20000 });
    log("rematch lists catalog versions and swaps the track");
    // Direct artwork override through the API.
    const artRes = await desk.request.post(`${BASE}/api/tracks/${s1.track.id}/rematch`, { data: { artworkUrl: s1.track.artworkUrl } });
    assert.equal(artRes.status(), 200);

    // Remove with confirmation: Ariel removes one of her own sends from her Log.
    await b.goto(`${BASE}/log?filter=sent`);
    await b.locator(".log__row").first().waitFor();
    const sentRows = await b.locator(".log__row").count();
    assert.ok(sentRows >= 3, `expected sent rows, got ${sentRows}`);
    await b.locator(".log__row").filter({ hasText: "Archangel" }).first().click();
    await b.getByRole("dialog").waitFor();
    await b.getByRole("button", { name: "Remove this send" }).click();
    await b.getByText("Remove this send?").waitFor();
    await b.getByText(/disappears for everyone/).waitFor();
    await b.locator("button[data-confirm]").click();
    await b.getByText("Removed").last().waitFor();
    await b.getByText("Archangel").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    assert.equal(await b.locator(".log__row").filter({ hasText: "Archangel" }).count(), 0, "send gone from Ariel's log");
    const reelAfterRemove = await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=all`)).json();
    assert.ok(!reelAfterRemove.sends.some((x) => x.id === s3.id), "removed send is gone for Joshua too");
    // Kept items and log entries can be removed through the same endpoint.
    const delKept = await desk.request.delete(`${BASE}/api/log/kept:${s1.id}`);
    assert.equal(delKept.status(), 200);
    const crateNow = await (await desk.request.get(`${BASE}/api/crate`)).json();
    assert.ok(!crateNow.sends.some((x) => x.id === s1.id), "unkept");
    const notMine = await phone.request.delete(`${BASE}/api/log/sent:${s1.id}`);
    assert.equal(notMine.status(), 200, "Ariel can delete her own send");
    const forbidden = await phone.request.delete(`${BASE}/api/log/log:nope`);
    assert.equal(forbidden.status(), 404);
    log("removals ask first and clean up for everyone");

    // ================= Notices: the bell top right =================
    // Ariel kept and replied to Joshua's sends above, and that came back to him as notices.
    const backNotices = (await (await desk.request.get(`${BASE}/api/notices`)).json()).notices;
    assert.ok(backNotices.some((n) => n.kind === "back" && /kept|wrote back|played out/.test(n.title)), "what came back on a send shows under the bell");
    assert.ok(backNotices.every((n) => n.kind !== "back" || n.action?.href === "/log?filter=back"), "and points at the Log's Back to you");
    for (const n of backNotices) await desk.request.post(`${BASE}/api/notices/dismiss`, { data: { id: n.id } });
    await a.goto(`${BASE}/live`);
    await a.getByRole("button", { name: "Notices" }).click();
    await a.getByText("Nothing needs you.").waitFor();
    await a.keyboard.press("Escape");
    const flagged = await desk.request.post(`${BASE}/api/test/source`, { data: { kind: "spotify", status: "reauth", error: "Reconnect Spotify to show what you are playing" } });
    assert.equal(flagged.status(), 200);
    await a.reload();
    await a.getByText("Reconnect Spotify to show what you are playing").first().waitFor();
    const bell = a.getByRole("button", { name: "1 notice" });
    await bell.waitFor();
    assert.equal(await a.locator(".bell__badge").textContent(), "1");
    await bell.click();
    await a.getByText("Spotify needs a quick reconnect").waitFor();
    assert.equal(await a.locator(".notices a.btn", { hasText: "Reconnect Spotify" }).getAttribute("href"), "/api/connect/spotify");
    await settled(a);
    await a.screenshot({ path: `${OUT}/23-notices-desktop.png` });
    await a.getByRole("button", { name: "Dismiss" }).click();
    await a.getByRole("button", { name: "Notices" }).waitFor();
    assert.equal(await a.locator(".bell__badge").count(), 0);
    assert.equal(await a.locator(".live__notice").count(), 0, "the Live prompt follows the dismissal");
    // Reconnecting (a fresh source save) forgets the dismissal; the test hook saves like a connect does.
    await desk.request.post(`${BASE}/api/test/source`, { data: { kind: "spotify", status: "reauth", error: "Reconnect Spotify to show what you are playing" } });
    await a.reload();
    await a.getByRole("button", { name: "1 notice" }).waitFor();
    await desk.request.post(`${BASE}/api/test/source`, { data: { kind: "spotify", status: "ok" } });
    await a.reload();
    await a.getByRole("button", { name: "Notices" }).waitFor();
    log("the bell lists what needs a hand, dismissal sticks until a reconnect, and a fix clears it");

    // ================= Days: the stream folded by date =================
    // Two of the crew's tracks happened on earlier days; the main page folds them under Earlier,
    // a card opens in place, and the day has its own page. Dates are the viewer's local ones.
    const allNow = (await (await desk.request.get(`${BASE}/api/sends?crew=${crew.id}&view=all`)).json()).sends;
    const twoDaysAgo = Date.now() - 2 * 86400000;
    const nineDaysAgo = Date.now() - 9 * 86400000;
    await desk.request.post(`${BASE}/api/test/backdate`, { data: { sendId: allNow[allNow.length - 1].id, createdAt: nineDaysAgo } });
    await desk.request.post(`${BASE}/api/test/backdate`, { data: { sendId: allNow[allNow.length - 2].id, createdAt: twoDaysAgo } });
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const plDays = (await (await desk.request.get(`${BASE}/api/playlist?crew=${crew.id}&tz=${encodeURIComponent(tzName)}`)).json()).playlist;
    assert.equal(plDays.days.length, 2, "two earlier days");
    assert.ok(plDays.sends.length >= 1, "today still has tracks");
    assert.ok(plDays.count > plDays.sends.length, "the all-time count covers every day");
    await a.goto(BASE);
    await a.locator(".pl__by").waitFor({ timeout: 20000 });
    await a.locator(".pl__by", { hasText: "all time" }).waitFor({ timeout: 20000 });
    const catchUp = a.getByRole("button", { name: /Show the playlist/ });
    if (await catchUp.count()) await catchUp.click();
    await a.getByText("Earlier", { exact: true }).waitFor({ timeout: 20000 });
    assert.equal(await a.locator(".day").count(), 2);
    await a.locator(".day__head").first().click();
    await a.locator(".day.is-open .pl__row").first().waitFor({ timeout: 20000 });
    await settled(a);
    await a.screenshot({ path: `${OUT}/25-earlier-desktop.png`, fullPage: true });
    await a.getByRole("link", { name: "Open the day" }).click();
    await a.waitForURL(/\/days\/\d{4}-\d{2}-\d{2}$/);
    await a.locator(".dayview .pl__row").first().waitFor({ timeout: 20000 });
    assert.ok((await a.locator(".pl__name").textContent())?.match(/day, /), "the day page is titled by its date");
    await a.getByRole("link", { name: "Days" }).first().click();
    await a.waitForURL(/\/days$/);
    await a.getByRole("heading", { name: "Days" }).waitFor();
    await a.locator(".day").nth(1).waitFor({ timeout: 20000 });
    assert.ok((await a.locator(".day").count()) >= 2, "the Days page lists every day");
    await settled(a);
    await a.screenshot({ path: `${OUT}/26-days-desktop.png`, fullPage: true });
    log("earlier days fold under the playlist, open in place, and have their own pages");

    // ================= Moving house: the import endpoint and its sign-in links =================
    // The live database file is importable into itself (every row replaced by id): counts come back, and
    // the sign-in link logs Joshua in from a cold browser, cookie-less.
    const { readFileSync: readDb } = await import("node:fs");
    const dbBytes = readDb(DB);
    const badImport = await desk.request.post(`${BASE}/api/admin/import`, { headers: { authorization: "Bearer nope", "content-type": "application/octet-stream" }, data: dbBytes });
    assert.equal(badImport.status(), 403);
    const imp = await desk.request.post(`${BASE}/api/admin/import`, { headers: { authorization: "Bearer e2e-cron", "content-type": "application/octet-stream" }, data: dbBytes });
    assert.equal(imp.status(), 200);
    const impJson = await imp.json();
    assert.ok(impJson.imported.users >= 2 && impJson.imported.sends > 0 && impJson.imported.tracks > 0, "tables came across");
    const joshLink = impJson.people.find((p) => p.name === "Joshua")?.signin;
    assert.ok(joshLink && joshLink.includes("/api/admin/signin?token="));
    const cold = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const c = await cold.newPage();
    await c.goto(joshLink);
    await c.waitForURL(`${BASE}/`);
    await c.locator(".pl__name").waitFor({ timeout: 20000 });
    assert.equal((await (await c.request.get(`${BASE}/api/me`)).json()).me?.name, "Joshua");
    await cold.close();
    log("the import endpoint copies a Crate across and its sign-in link opens the door");

    // Light mode + desktop log for the record.
    const light = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", storageState: await desk.storageState() });
    const l = await light.newPage();
    await l.goto(`${BASE}/log`);
    await l.getByText("Log", { exact: true }).first().waitFor();
    await l.screenshot({ path: `${OUT}/14-log-light-desktop.png` });
    await light.close();

    await desk.close();
    await phone.close();
    console.log("\nE2E passed.");
  } catch (e) {
    failed = true;
    console.error("\nE2E FAILED:", e);
    console.error("--- server log tail ---\n" + serverLog.slice(-3000));
  } finally {
    await browser.close();
    stopServer();
  }
  process.exit(failed ? 1 : 0);
}

main();
