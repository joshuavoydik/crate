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

test("the moment is named on the viewer's clock, not the server's", () => {
  // 20:43 UTC on a Monday is 13:43 in Los Angeles: an afternoon there, an evening in London.
  const at = new Date(Date.UTC(2026, 9, 19, 20, 43));
  const base = { crewName: "c", memberNames: [], tracks: [], count: 0, when: at };
  assert.equal(templatedPlaylistName({ ...base, tz: "America/Los_Angeles" }), "Monday afternoon");
  assert.equal(templatedPlaylistName({ ...base, tz: "Europe/London" }), "Monday evening");
  assert.equal(templatedPlaylistName({ ...base, tz: "Asia/Tokyo" }), "Tuesday morning");
  // 01:30 in Tokyo still belongs to Monday evening; 05:00 is Tuesday morning.
  assert.equal(dayPart(new Date(Date.UTC(2026, 9, 19, 16, 30)), "Asia/Tokyo").day, "Monday");
  assert.equal(dayPart(new Date(Date.UTC(2026, 9, 19, 16, 30)), "Asia/Tokyo").part, "evening");
  assert.equal(dayPart(new Date(Date.UTC(2026, 9, 19, 20, 0)), "Asia/Tokyo").day, "Tuesday");
  assert.equal(momentKey(at, "America/Los_Angeles"), "2026-10-19-afternoon");
  assert.equal(momentKey(at, "Asia/Tokyo"), "2026-10-20-morning");
  // A zone Intl does not know falls back to the server's clock rather than failing.
  assert.ok(/^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day (morning|afternoon|evening)$/.test(templatedPlaylistName({ ...base, tz: "Nowhere/Nope" })));
});
