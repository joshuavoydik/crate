import { test } from "node:test";
import assert from "node:assert/strict";
import { isoDurationMs } from "../../src/lib/sources/types.ts";
import { normalizeHandle } from "../../src/lib/ingest.ts";
import { viaLabel } from "../../src/lib/client.ts";
import { tidalItemsFromJson } from "../../src/lib/sources/tidal.ts";
import { deriveNotices } from "../../src/lib/notices.ts";
import { parseNowLines, installScript, terminalFile, permissionProblem, clockMs } from "../../src/lib/mac.ts";

test("ISO durations", () => {
  assert.equal(isoDurationMs("PT3M33S"), 213000);
  assert.equal(isoDurationMs("PT1H2M3S"), 3723000);
  assert.equal(isoDurationMs("PT45S"), 45000);
  assert.equal(isoDurationMs(undefined), null);
  assert.equal(isoDurationMs("nope"), null);
});

test("iMessage handles normalize so numbers and emails match across spellings", () => {
  assert.equal(normalizeHandle("+1 (415) 555-0100"), "+14155550100");
  assert.equal(normalizeHandle("415-555-0100"), "+14155550100");
  assert.equal(normalizeHandle("14155550100"), "+14155550100");
  assert.equal(normalizeHandle("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizeHandle("Ariel@iCloud.com"), "ariel@icloud.com");
});

test("Spotify currently-playing maps to a now-playing item, or nothing", async () => {
  const { nowPlayingFromJson } = await import("../../src/lib/sources/spotify.ts");
  const item = {
    id: "abc",
    name: "Archangel",
    artists: [{ name: "Burial" }],
    album: { name: "Untrue", images: [{ url: "small.jpg", width: 64 }, { url: "big.jpg", width: 640 }], release_date: "2007-11-05" },
    duration_ms: 238000,
    preview_url: null,
    external_urls: { spotify: "https://open.spotify.com/track/abc" },
  };
  const now = nowPlayingFromJson({ is_playing: true, progress_ms: 12000, currently_playing_type: "track", item });
  assert.ok(now);
  assert.equal(now.playing, true);
  assert.equal(now.progressMs, 12000);
  assert.equal(now.durationMs, 238000);
  assert.equal(now.meta.artist, "Burial");
  assert.equal(now.meta.artworkUrl, "big.jpg");
  assert.equal(now.meta.year, 2007);
  assert.equal(nowPlayingFromJson({ is_playing: false, item: null }), null);
  assert.equal(nowPlayingFromJson({ is_playing: true, currently_playing_type: "episode", item }), null);
  assert.equal(nowPlayingFromJson(null), null);
});

test("Last.fm now playing is the entry flagged nowplaying, else nothing", async () => {
  const { nowPlayingFromRecent } = await import("../../src/lib/sources/lastfm.ts");
  const playing = {
    recenttracks: {
      track: [
        { name: "Hyph Mngo", artist: { "#text": "Joy Orbison" }, album: { "#text": "Hyph Mngo" }, url: "https://last.fm/x", image: [{ "#text": "xl.jpg", size: "extralarge" }], "@attr": { nowplaying: "true" } },
        { name: "Older", artist: { "#text": "Someone" }, date: { uts: "1700000000" } },
      ],
    },
  };
  const n = nowPlayingFromRecent(playing);
  assert.ok(n);
  assert.equal(n.title, "Hyph Mngo");
  assert.equal(n.artist, "Joy Orbison");
  assert.equal(n.artworkUrl, "xl.jpg");
  assert.equal(nowPlayingFromRecent({ recenttracks: { track: [{ name: "Older", artist: { "#text": "Someone" }, date: { uts: "1700000000" } }] } }), null);
  assert.equal(nowPlayingFromRecent(undefined), null);
});

test("Spotify track URIs come straight from a Spotify link without a search", async () => {
  const { spotifyTrackUri } = await import("../../src/lib/sources/spotify.ts");
  const r = await spotifyTrackUri({ access_token: "x", expires_at: Date.now() + 1e6 }, "Burial", "Archangel", "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc");
  assert.equal(r.uri, "spotify:track:4cOdK2wGLETKBW3PvgPWqT");
  const intl = await spotifyTrackUri({ access_token: "x", expires_at: Date.now() + 1e6 }, "a", "b", "https://open.spotify.com/intl-de/track/0DiWol3AO6WpXZgp0goxAV");
  assert.equal(intl.uri, "spotify:track:0DiWol3AO6WpXZgp0goxAV");
});

test("a pasted .p8 is rebuilt into a proper PEM whatever shape it arrived in", async () => {
  const { normalizePem } = await import("../../src/lib/sources/apple.ts");
  const body = "MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk";
  const expected = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  assert.equal(normalizePem(`-----BEGIN PRIVATE KEY-----\n${body.slice(0, 64)}\n${body.slice(64)}\n-----END PRIVATE KEY-----\n`), expected);
  assert.equal(normalizePem(`-----BEGIN PRIVATE KEY-----\\n${body}\\n-----END PRIVATE KEY-----`), expected);
  assert.equal(normalizePem(`-----BEGIN PRIVATE KEY----- ${body.slice(0, 30)} ${body.slice(30)} -----END PRIVATE KEY-----`), expected);
  assert.equal(normalizePem(body), expected);
});

test("where a send came from reads as a phrase, plays included", () => {
  assert.equal(viaLabel("app"), null);
  assert.equal(viaLabel("spotify"), "liked on Spotify");
  assert.equal(viaLabel("played:apple"), "played on Apple Music");
  assert.equal(viaLabel("played:spotify"), "played on Spotify");
  assert.equal(viaLabel("imessage"), "via iMessage");
});

test("a TIDAL collection page becomes liked items with artists joined, skipping what was seen", () => {
  const page = {
    data: [
      { id: "1", type: "tracks", meta: { addedAt: "2026-10-15T20:00:00Z" } },
      { id: "2", type: "tracks" },
      { id: "3", type: "tracks" },
    ],
    included: [
      {
        id: "1",
        type: "tracks",
        attributes: { title: "Archangel", duration: "PT3M58S", externalLinks: [{ href: "https://tidal.com/browse/track/1?u", meta: { type: "TIDAL_SHARING" } }] },
        relationships: { artists: { data: [{ id: "a", type: "artists" }] } },
      },
      { id: "2", type: "tracks", attributes: { title: "Duet", duration: "PT2M" }, relationships: { artists: { data: [{ id: "a", type: "artists" }, { id: "b", type: "artists" }] } } },
      { id: "a", type: "artists", attributes: { name: "Burial" } },
      { id: "b", type: "artists", attributes: { name: "Four Tet" } },
    ],
  };
  const { items, ids } = tidalItemsFromJson(page, new Set(["3"]), 1_000_000);
  assert.deepEqual(ids, ["1", "2", "3"]);
  assert.equal(items.length, 2);
  assert.equal(items[0].meta.artist, "Burial");
  assert.equal(items[0].at, Date.parse("2026-10-15T20:00:00Z"));
  assert.equal(items[0].meta.sourceUrl, "https://tidal.com/browse/track/1?u");
  assert.equal(items[0].meta.durationMs, 238000);
  assert.equal(items[1].meta.artist, "Burial, Four Tet");
  assert.equal(items[1].at, 1_000_000 - 60_000);
  assert.equal(items[1].meta.sourceUrl, "https://tidal.com/browse/track/2");
});

test("notices come from sources that need a hand, skip transient errors, and honor dismissals", () => {
  const sources = [
    { kind: "spotify", status: "reauth", error: "Reconnect Spotify to show what you are playing", last_sync_at: 1 },
    { kind: "soundcloud", status: "error", error: "This operation was aborted", last_sync_at: 2 },
    { kind: "youtube", status: "error", error: "401 from www.googleapis.com", last_sync_at: 3 },
    { kind: "apple", status: "ok", error: null, last_sync_at: 4 },
  ];
  const all = deriveNotices(sources, new Set());
  assert.deepEqual(
    all.map((n) => [n.id.split(":").slice(0, 2).join(":"), n.action?.href]),
    [
      ["reconnect:spotify", "/api/connect/spotify"],
      ["error:youtube", "/api/connect/youtube"],
    ],
  );
  assert.equal(all[0].title, "Spotify needs a quick reconnect");
  const left = deriveNotices(sources, new Set(["reconnect:spotify"]));
  assert.equal(left.length, 1);
  assert.equal(left[0].title, "YouTube stopped syncing");
});

test("the Mac helper's raw lines become one now-playing report, plus which app refused", () => {
  assert.deepEqual(parseNowLines(""), { now: null, errors: [] });
  assert.deepEqual(parseNowLines("\n\n").now, null);
  const apple = parseNowLines("apple\tUntrue\tBurial\tUntrue\t263.5\t45.2\t\n").now;
  assert.deepEqual(apple, { source: "apple", title: "Untrue", artist: "Burial", album: "Untrue", durationMs: 263500, positionMs: 45200, url: null });
  const sp = parseNowLines("spotify\tOne More Time\tDaft Punk\tDiscovery\t320.357\t12\tspotify:track:0DiWol3AO6WpXZgp0goxAV\n").now;
  assert.equal(sp?.source, "spotify");
  assert.equal(sp?.url, "spotify:track:0DiWol3AO6WpXZgp0goxAV");
  const sc = parseNowLines("soundcloud\t\u25B6 Archangel by Burial | Listen online for free on SoundCloud\t\t\t\t\thttps://soundcloud.com/burial/archangel\n").now;
  assert.deepEqual(sc, { source: "soundcloud", title: "Archangel", artist: "Burial", album: null, durationMs: null, positionMs: null, url: "https://soundcloud.com/burial/archangel" });
  // The first playing thing wins when two report at once; refusals ride along.
  const both = parseNowLines("err\tGoogle Chrome\tNot authorized to send Apple events to Google Chrome. (-1743)\napple\tA\tx\t\t1\t0\t\nspotify\tB\ty\t\t1\t0\t\n");
  assert.equal(both.now?.title, "A");
  assert.deepEqual(both.errors, [{ app: "Google Chrome", message: "Not authorized to send Apple events to Google Chrome. (-1743)" }]);
  assert.equal(permissionProblem(both.errors), "Google Chrome");
  assert.equal(permissionProblem([{ app: "Spotify", message: "Spotify got an error: Connection is invalid." }]), null);
});

test("the installer carries the person's token, the AppleScript and a launchd agent", () => {
  const s = installScript({ url: "http://localhost:3000/", token: "crate_abc" });
  assert.ok(s.startsWith("#!/bin/bash"));
  assert.ok(s.includes('TOKEN="crate_abc"'));
  assert.ok(s.includes('URL="http://localhost:3000"'), "trailing slash dropped");
  assert.ok(s.includes("/api/ingest/now"));
  assert.ok(s.includes('tell application "Music"'));
  assert.ok(s.includes("launchctl bootstrap"));
  assert.ok(s.includes("com.crate.nowplaying"));
  assert.ok(s.includes('has "Spotify" && running "Spotify"'), "asks only apps that exist and run");
  assert.equal((s.match(/<<'CRATE_EOF'/g) ?? []).length, 4, "three scripts and the runner");
  assert.equal((s.match(/^CRATE_EOF$/gm) ?? []).length, 5);
  const t = terminalFile({ url: "http://localhost:3000", token: "crate_abc" });
  assert.ok(t.includes("<key>CommandString</key>"));
  assert.ok(t.includes("/api/mac/install?key=crate_abc"));
  assert.ok(t.includes("<key>RunCommandAsShell</key>"));
});

test("SoundCloud read from the player bar keeps its fields; the tab title is only a fallback", () => {
  const bar = parseNowLines("soundcloud\tStand by Me\tBen E. King\t\t2:57\t1:02\thttps://soundcloud.com/ben/stand-by-me\n").now;
  assert.deepEqual(bar, { source: "soundcloud", title: "Stand by Me", artist: "Ben E. King", album: null, durationMs: 177000, positionMs: 62000, url: "https://soundcloud.com/ben/stand-by-me" });
  assert.equal(clockMs("1:02:03"), 3723000);
  assert.equal(clockMs("nope"), null);
  const web = parseNowLines("deezer\tHarder Better Faster Stronger\tDaft Punk\tDiscovery\t224\t10\thttps://www.deezer.com/track/3135556\n").now;
  assert.equal(web?.source, "deezer");
});

test("a Spotify refresh keeps the granted scope, so an hour-old connection is not asked to reconnect", async () => {
  const { tokenFromRefresh, spotifyTokenCurrent, SPOTIFY_SCOPES } = await import("../../src/lib/sources/spotify.ts");
  const granted = { access_token: "a", refresh_token: "r1", expires_at: 1, scope: SPOTIFY_SCOPES };
  // Spotify's refresh answer may leave out the scope and the refresh token: both carry over.
  const refreshed = tokenFromRefresh(granted, { access_token: "b", expires_in: 3600 }, 1_000_000);
  assert.equal(refreshed.scope, SPOTIFY_SCOPES);
  assert.equal(refreshed.refresh_token, "r1");
  assert.equal(refreshed.expires_at, 1_000_000 + 3_600_000);
  assert.ok(spotifyTokenCurrent(refreshed));
  // When it rotates them, the new values win.
  const rotated = tokenFromRefresh(granted, { access_token: "c", refresh_token: "r2", expires_in: 60, scope: "user-library-read" });
  assert.equal(rotated.refresh_token, "r2");
  assert.equal(spotifyTokenCurrent(rotated), false, "a token known to lack a scope is flagged");
  assert.ok(spotifyTokenCurrent({ access_token: "d", expires_at: 1 }), "a token with no recorded scope is tried, not flagged");
});
