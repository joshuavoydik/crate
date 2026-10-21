import { test, before } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

const FILE = "./data/unit-tuned.db";
before(() => {
  for (const f of [FILE, `${FILE}-journal`, `${FILE}-wal`, `${FILE}-shm`]) rmSync(f, { force: true });
  process.env.DATABASE_URL = `file:${FILE}`;
});

test("who is tuned in: members by face, station listeners by number, and a lone viewer still counts", async () => {
  const { run } = await import("../../src/lib/db.ts");
  const { tuneIn, tunedIn, tunedInDetail } = await import("../../src/lib/live.ts");
  const t = Date.now();
  await run("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Joshua Voydik', ?)", [t]);
  await run("INSERT INTO users (id, name, created_at) VALUES ('u2', 'Dana Zoe', ?)", [t]);
  await run("INSERT INTO crews (id, name, invite_code, created_by, created_at) VALUES ('c1', 'Us', 'us-crew', 'u1', ?)", [t]);

  assert.deepEqual(await tunedInDetail("c1"), { count: 0, people: [], anonymous: 0 }, "an empty room is a number too");
  await tuneIn("c1", "u1");
  let d = await tunedInDetail("c1");
  assert.equal(d.count, 1);
  assert.deepEqual(d.people.map((p) => p.name), ["Joshua Voydik"], "just you still shows");

  await tuneIn("c1", "u2");
  await tuneIn("c1", "anon:abcdef12");
  await tuneIn("c1", "anon:abcdef12");
  await tuneIn("c1", "anon:zzzzzz99");
  d = await tunedInDetail("c1");
  assert.equal(d.count, 4, "two members and two station listeners; a listener seen twice counts once");
  assert.equal(d.anonymous, 2);
  assert.deepEqual(d.people.map((p) => p.id).sort(), ["u1", "u2"]);
  assert.equal(await tunedIn("c1"), 4, "the plain count agrees");

  // Someone who closed the page a minute ago is gone.
  await run("UPDATE tune_ins SET seen_at = ? WHERE viewer = 'u2'", [t - 60_000]);
  d = await tunedInDetail("c1");
  assert.equal(d.count, 3);
  assert.deepEqual(d.people.map((p) => p.id), ["u1"]);
});
