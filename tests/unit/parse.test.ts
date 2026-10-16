import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectSource,
  cleanVideoTitle,
  parseSoundcloudTitle,
  parseSpotifyDescription,
  parseBandcampTitle,
  extractUrl,
  fingerprint,
  similarity,
  metaContent,
} from "../../src/lib/resolve/parse.ts";

test("detectSource recognizes every platform", () => {
  assert.equal(detectSource("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc").id, "4cOdK2wGLETKBW3PvgPWqT");
  assert.equal(detectSource("https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT").platform, "spotify");
  assert.equal(detectSource("spotify:track:4cOdK2wGLETKBW3PvgPWqT").id, "4cOdK2wGLETKBW3PvgPWqT");
  const apple = detectSource("https://music.apple.com/us/album/archangel/893175779?i=893175788&uo=4");
  assert.equal(apple.platform, "apple");
  assert.equal(apple.id, "893175788");
  assert.equal(detectSource("https://music.apple.com/us/song/archangel/893175788").id, "893175788");
  assert.equal(detectSource("https://youtu.be/dQw4w9WgXcQ?t=10").id, "dQw4w9WgXcQ");
  assert.equal(detectSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x").id, "dQw4w9WgXcQ");
  assert.equal(detectSource("https://music.youtube.com/watch?v=dQw4w9WgXcQ").platform, "youtube");
  assert.equal(detectSource("https://www.youtube.com/shorts/abc123").id, "abc123");
  const sc = detectSource("https://soundcloud.com/forss/flickermood");
  assert.equal(sc.platform, "soundcloud");
  assert.equal(sc.slugArtist, "forss");
  assert.equal(sc.slugTitle, "flickermood");
  const bc = detectSource("https://burial.bandcamp.com/track/archangel-live-edit");
  assert.equal(bc.platform, "bandcamp");
  assert.equal(bc.slugArtist, "burial");
  assert.equal(bc.slugTitle, "archangel live edit");
  const bp = detectSource("https://www.beatport.com/track/archangel/1234567");
  assert.equal(bp.platform, "beatport");
  assert.equal(bp.id, "1234567");
  assert.equal(detectSource("https://tidal.com/browse/track/12345").id, "12345");
  assert.equal(detectSource("https://www.deezer.com/en/track/3135556").id, "3135556");
  assert.equal(detectSource("https://example.com/whatever").platform, "unknown");
  assert.equal(detectSource("not a url").platform, "unknown");
});

test("cleanVideoTitle strips junk and keeps what matters", () => {
  assert.deepEqual(cleanVideoTitle("Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)"), {
    artist: "Rick Astley",
    title: "Never Gonna Give You Up",
  });
  assert.deepEqual(cleanVideoTitle("Burial – Archangel [HQ]"), { artist: "Burial", title: "Archangel" });
  assert.deepEqual(cleanVideoTitle("Four Tet - Baby (KH Remix) [Official Audio]"), {
    artist: "Four Tet",
    title: "Baby (KH Remix)",
  });
  assert.deepEqual(cleanVideoTitle("Overmono - So U Kno (Official Video) | XL Recordings"), {
    artist: "Overmono",
    title: "So U Kno",
  });
  assert.deepEqual(cleanVideoTitle("PREMIERE: Daniel Avery - Drone Logic (Original Mix)"), {
    artist: "Daniel Avery",
    title: "Drone Logic (Original Mix)",
  });
  assert.deepEqual(cleanVideoTitle("Archangel", "Burial - Topic"), { artist: "Burial", title: "Archangel" });
  assert.deepEqual(cleanVideoTitle("Never Gonna Give You Up (Official Music Video)", "RickAstleyVEVO"), {
    artist: "RickAstley",
    title: "Never Gonna Give You Up",
  });
  assert.deepEqual(cleanVideoTitle("Teardrop (feat. Elizabeth Fraser) (Lyrics)", "Massive Attack"), {
    artist: "Massive Attack",
    title: "Teardrop (feat. Elizabeth Fraser)",
  });
  assert.deepEqual(cleanVideoTitle("Some Song (2019)"), { title: "Some Song" });
  assert.deepEqual(cleanVideoTitle("Blue Monday by New Order"), { artist: "New Order", title: "Blue Monday" });
});

test("platform-specific title parsers", () => {
  assert.deepEqual(parseSoundcloudTitle("Flickermood by Forss"), { artist: "Forss", title: "Flickermood" });
  assert.deepEqual(parseSoundcloudTitle("Archangel (Live Edit) [FREE DL] by Burial"), {
    artist: "Burial",
    title: "Archangel (Live Edit)",
  });
  assert.deepEqual(parseSpotifyDescription("Rick Astley · Whenever You Need Somebody · Song · 1987"), {
    artist: "Rick Astley",
    album: "Whenever You Need Somebody",
    year: 1987,
  });
  assert.deepEqual(parseSpotifyDescription("Burial · Song · 2007"), { artist: "Burial", year: 2007 });
  assert.deepEqual(parseBandcampTitle("Archangel, by Burial"), { artist: "Burial", title: "Archangel" });
});

test("extractUrl finds a link in share-sheet text", () => {
  assert.equal(
    extractUrl("Check this out", "listen: https://open.spotify.com/track/abc?si=1.", null),
    "https://open.spotify.com/track/abc?si=1",
  );
  assert.equal(extractUrl("nothing here"), null);
});

test("fingerprint and similarity", () => {
  assert.equal(fingerprint("Burial", "Archangel", "893175788"), "apple:893175788");
  assert.equal(fingerprint("Burial", "Archangel", null), "name:burial|archangel");
  assert.equal(fingerprint("Björk", "Jóga"), fingerprint("Bjork", "Joga"));
  assert.equal(similarity("Never Gonna Give You Up", "Never Gonna Give You Up"), 1);
  assert.ok(similarity("Never Gonna Give You Up", "Never Gonna Give You Up (Karaoke Version)") > 0.6);
  assert.equal(similarity("Archangel", "Something Else"), 0);
});

test("metaContent handles attribute order and quoting", () => {
  const html = `<html><head><meta content='Hello &amp; World' property="og:title"/><meta name="description" content="x"></head></html>`;
  assert.equal(metaContent(html, "og:title"), "Hello & World");
  assert.equal(metaContent(html, "description"), "x");
  assert.equal(metaContent(html, "og:image"), null);
});

test("video titles that are covers, edits or mixes are flagged as one-offs", async () => {
  const { looksOneOff } = await import("../../src/lib/resolve/parse.ts");
  assert.equal(looksOneOff("Pixies - Where Is My Mind? (Official Audio)"), false);
  assert.equal(looksOneOff("Where Is My Mind? (Piano Cover)"), true);
  assert.equal(looksOneOff("Where Is My Mind - slowed + reverb"), true);
  assert.equal(looksOneOff("Burial - Archangel (Bootleg Edit)"), true);
  assert.equal(looksOneOff("Boiler Room: Four Tet DJ Set"), true);
  assert.equal(looksOneOff("Daft Punk - One More Time"), false);
});

test("openable splits a track's links into real places and mere searches", async () => {
  const { buildLinks, openable } = await import("../../src/lib/resolve/links.ts");
  const links = buildLinks("Someone", "A Cover", { youtube: "https://youtu.be/x" });
  const o = openable(links, "apple");
  assert.deepEqual(o.direct, ["youtube"]);
  assert.equal(o.search[0], "apple");
  assert.ok(!o.search.includes("youtube"));
  const resolved = buildLinks("Burial", "Archangel", { apple: "https://music.apple.com/x", youtube: "https://youtu.be/y" });
  assert.deepEqual(openable(resolved, "spotify").direct, ["apple", "youtube"]);
});
