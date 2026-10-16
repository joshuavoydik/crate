import { test } from "node:test";
import assert from "node:assert/strict";
import { templatedPlaylistName, momentKey, dayPart } from "../../src/lib/agent.ts";

test("the playlist name is the day and the part of the day, nothing else", () => {
  const t = (genre: string | null, bpm: number | null) => ({ artist: "x", title: "y", genre, bpm });
  const tracks = [t("Electronic", 128), t("Alternative", 130), t("Pop", 100)];
  assert.equal(templatedPlaylistName({ crewName: "c", memberNames: [], tracks, count: 3, when: new Date(2026, 9, 15, 16, 10) }), "Thursday afternoon");
  assert.equal(templatedPlaylistName({ crewName: "c", memberNames: [], tracks, count: 3, when: new Date(2026, 9, 15, 20, 34) }), "Thursday evening");
  assert.equal(templatedPlaylistName({ crewName: "c", memberNames: [], tracks: [], count: 0, when: new Date(2026, 9, 18, 9, 0) }), "Sunday morning");
  assert.equal(templatedPlaylistName({ crewName: "c", memberNames: [], tracks, count: 3, when: new Date(2026, 9, 14, 11, 59) }), "Wednesday morning");
  assert.equal(templatedPlaylistName({ crewName: "c", memberNames: [], tracks, count: 3, when: new Date(2026, 9, 14, 12, 0) }), "Wednesday afternoon");
  assert.equal(templatedPlaylistName({ crewName: "c", memberNames: [], tracks, count: 3, when: new Date(2026, 9, 14, 17, 0) }), "Wednesday evening");
});

test("the small hours still belong to the evening before", () => {
  assert.deepEqual(dayPart(new Date(2026, 9, 16, 1, 30)).day, "Thursday");
  assert.equal(dayPart(new Date(2026, 9, 16, 1, 30)).part, "evening");
  assert.equal(dayPart(new Date(2026, 9, 16, 5, 0)).day, "Friday");
  assert.equal(dayPart(new Date(2026, 9, 16, 5, 0)).part, "morning");
});

test("the moment a name belongs to moves with the part of the day", () => {
  const afternoon = new Date(2026, 9, 15, 16, 10);
  const stillAfternoon = new Date(2026, 9, 15, 13, 5);
  const evening = new Date(2026, 9, 15, 20, 34);
  const lateNight = new Date(2026, 9, 16, 1, 0);
  const nextMorning = new Date(2026, 9, 16, 8, 0);
  assert.equal(momentKey(afternoon), momentKey(stillAfternoon));
  assert.notEqual(momentKey(afternoon), momentKey(evening));
  assert.equal(momentKey(evening), momentKey(lateNight));
  assert.notEqual(momentKey(lateNight), momentKey(nextMorning));
});
