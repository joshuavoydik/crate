import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, type CatalogTrack } from "../../src/lib/resolve/itunes.ts";

const base: CatalogTrack = { appleId: "1", artist: "Dezza", title: "Honey", album: "Honey - Single", artworkUrl: null, previewUrl: null, appleUrl: null, genre: null, durationMs: null, year: 2019 };

test("the original beats a mixed cut on a compilation", () => {
  const original = scoreCandidate(base, "Dezza", "Honey");
  const mixed = scoreCandidate({ ...base, appleId: "2", title: "Honey (Mixed)", album: "Enhanced Best Of 2019, Mixed by Disco Fries" }, "Dezza", "Honey");
  const radio = scoreCandidate({ ...base, appleId: "3", title: "Honey (Radio Edit)" }, "Dezza", "Honey");
  assert.ok(original > mixed, `original ${original} vs mixed ${mixed}`);
  assert.ok(original > radio, `original ${original} vs radio ${radio}`);
});

test("asking for a version keeps that version on top", () => {
  const want = "Honey (Extended)";
  const extended = scoreCandidate({ ...base, title: "Honey (Extended)" }, "Dezza", want);
  const original = scoreCandidate(base, "Dezza", want);
  assert.ok(extended > original);
});

test("a karaoke version never wins", () => {
  const real = scoreCandidate(base, "Dezza", "Honey");
  const karaoke = scoreCandidate({ ...base, artist: "Karaoke Hits", album: "Karaoke in the Style of Dezza" }, "Dezza", "Honey");
  assert.ok(real > karaoke + 0.3);
});
