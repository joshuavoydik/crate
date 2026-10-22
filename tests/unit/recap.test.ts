import { test, before } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

const FILE = "./data/unit-recap.db";
before(() => {
  for (const f of [FILE, `${FILE}-journal`, `${FILE}-wal`, `${FILE}-shm`]) rmSync(f, { force: true });
  process.env.DATABASE_URL = `file:${FILE}`;
  process.env.SESSION_SECRET = "unit-test-secret-long-enough-0123456789";
});

test("the week starts on Monday, in UTC", async () => {
  const { weekStart } = await import("../../src/lib/recap.ts");
  // Wednesday 21 Oct 2026 12:00 UTC → Monday 19 Oct 00:00 UTC.
  assert.equal(weekStart(Date.UTC(2026, 9, 21, 12)), Date.UTC(2026, 9, 19));
  // A Monday is its own week start; a Sunday belongs to the Monday before it.
  assert.equal(weekStart(Date.UTC(2026, 9, 19, 3)), Date.UTC(2026, 9, 19));
  assert.equal(weekStart(Date.UTC(2026, 9, 25, 23)), Date.UTC(2026, 9, 19));
});

test("a week's recap counts hand sends, keeps, lines back and the most-played track", async () => {
  const { run } = await import("../../src/lib/db.ts");
  const { weekRecap, recapLine, weekStart } = await import("../../src/lib/recap.ts");
  const to = weekStart();
  const inWeek = to - 3 * 86400000;
  await run("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Joshua Voydik', ?), ('u2', 'Dana Zoe', ?)", [inWeek, inWeek]);
  await run("INSERT INTO crews (id, name, invite_code, created_by, created_at) VALUES ('c1', 'Night Shift', 'ns-crew', 'u1', ?)", [inWeek]);
  await run("INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES ('c1', 'u1', ?), ('c1', 'u2', ?)", [inWeek, inWeek]);
  await run("INSERT INTO tracks (id, fingerprint, artist, title, created_at) VALUES ('t1', 'f1', 'Emancipator', 'Tiger Moth', ?), ('t2', 'f2', 'M83', 'Midnight City', ?)", [inWeek, inWeek]);
  await run("INSERT INTO sends (id, crew_id, track_id, from_user_id, note, note_by, created_at, via) VALUES ('s1', 'c1', 't1', 'u2', 'trust me', 'human', ?, 'app'), ('s2', 'c1', 't2', 'u2', NULL, 'human', ?, 'app'), ('s3', 'c1', 't2', 'u1', NULL, 'agent', ?, 'played:spotify')", [inWeek, inWeek + 1000, inWeek + 2000]);
  await run("INSERT INTO reactions (send_id, user_id, status, reply, updated_at) VALUES ('s1', 'u1', 'saved', 'ok that bridge', ?)", [inWeek + 5000]);
  for (let i = 0; i < 3; i++) {
    await run("INSERT INTO live_history (id, user_id, source, track_id, title, artist, started_at, ended_at) VALUES (?, 'u1', 'spotify', 't1', 'Tiger Moth', 'Emancipator', ?, ?)", [`lh${i}`, inWeek + i * 600000, inWeek + i * 600000 + 240000]);
  }
  // Dana listening while Joshua's second session runs: one overlap.
  await run("INSERT INTO live_history (id, user_id, source, track_id, title, artist, started_at, ended_at) VALUES ('lhd', 'u2', 'apple', 't2', 'Midnight City', 'M83', ?, ?)", [inWeek + 600000 + 60000, inWeek + 600000 + 200000]);
  const r = await weekRecap("c1", to);
  assert.ok(r);
  assert.equal(r.handSends, 2);
  assert.equal(r.autoSends, 1);
  assert.equal(r.kept, 1);
  assert.equal(r.replies, 1);
  assert.equal(r.topSender, "Dana");
  assert.deepEqual(r.topTrack, { title: "Tiger Moth", artist: "Emancipator", plays: 3 });
  assert.equal(r.together, 1);
  const line = recapLine(r);
  assert.match(line, /2 songs sent, mostly by Dana/);
  assert.match(line, /1 kept/);
  assert.match(line, /Tiger Moth played 3 times/);
  assert.match(line, /1 time you were on at once/);
  // The week before was empty: no recap, no ping.
  assert.equal(await weekRecap("c1", to - 7 * 86400000), null);
});

test("the push key pair comes from the secret and stays put", async () => {
  const { vapidKeys } = await import("../../src/lib/push.ts");
  const a = vapidKeys();
  assert.equal(a.publicKey.length, 87, "an uncompressed P-256 point, base64url");
  assert.equal(a.privateKey.length, 43);
  assert.deepEqual(vapidKeys(), a);
});
