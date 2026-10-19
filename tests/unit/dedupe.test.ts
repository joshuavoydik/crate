import { test, before } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// A real SQLite file: the doubles fix is SQL, so it is tested as SQL.
const FILE = "./data/unit-dedupe.db";
before(() => {
  for (const f of [FILE, `${FILE}-journal`, `${FILE}-wal`, `${FILE}-shm`]) rmSync(f, { force: true });
  process.env.DATABASE_URL = `file:${FILE}`;
});

test("a send of a track already in the crew's playlist is refused in one statement; a later one goes in", async () => {
  const { createSendUnlessRecent } = await import("../../src/lib/queries.ts");
  const { run } = await import("../../src/lib/db.ts");
  const t = Date.now();
  await run("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Joshua', ?)", [t]);
  await run("INSERT INTO crews (id, name, invite_code, created_by, created_at) VALUES ('c1', 'Us', 'us', 'u1', ?)", [t]);
  await run("INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES ('c1', 'u1', ?)", [t]);
  await run("INSERT INTO tracks (id, fingerprint, artist, title, created_at) VALUES ('t1', 'fp1', 'Burial', 'Archangel', ?)", [t]);
  const base = { crewId: "c1", trackId: "t1", fromUserId: "u1", note: null, noteBy: "agent" as const, sourceUrl: null, via: "played:spotify" };
  const first = await createSendUnlessRecent(base, 60_000);
  assert.ok(first, "the first lands");
  const second = await createSendUnlessRecent(base, 60_000);
  assert.equal(second, null, "the same track again inside the window is refused");
  const unguarded = await createSendUnlessRecent(base, 0);
  assert.ok(unguarded, "with no window it is an ordinary insert");
  await run("DELETE FROM sends WHERE id = ?", [unguarded!.id]);
});

test("doubles already written are folded into one, keeping reactions and echoes", async () => {
  const { dedupeDoubles, db, run, all } = await import("../../src/lib/db.ts");
  const t = Date.now();
  await run("INSERT INTO users (id, name, created_at) VALUES ('u2', 'Ariel', ?)", [t]);
  await run("INSERT INTO tracks (id, fingerprint, artist, title, created_at) VALUES ('t2', 'fp2', 'Four Tet', 'Two Thousand and Seventeen', ?)", [t]);
  // Two syncs wrote the same play 3 seconds apart; Ariel reacted to the second one.
  await run("INSERT INTO sends (id, crew_id, track_id, from_user_id, note_by, via, created_at) VALUES ('s_a', 'c1', 't2', 'u1', 'agent', 'played:spotify', ?)", [t]);
  await run("INSERT INTO sends (id, crew_id, track_id, from_user_id, note_by, via, created_at) VALUES ('s_b', 'c1', 't2', 'u1', 'agent', 'played:spotify', ?)", [t + 3000]);
  await run("INSERT INTO reactions (send_id, user_id, status, updated_at) VALUES ('s_b', 'u2', 'kept', ?)", [t + 5000]);
  await run("INSERT INTO echoes (send_id, user_id, at, via) VALUES ('s_b', 'u2', ?, 'played:apple')", [t + 6000]);
  // Not a double: the same track a day later.
  await run("INSERT INTO sends (id, crew_id, track_id, from_user_id, note_by, via, created_at) VALUES ('s_c', 'c1', 't2', 'u1', 'agent', 'app', ?)", [t + 86_400_000]);
  // Live history: one song written twice by two readers; and a different song.
  await run("INSERT INTO live_history (id, user_id, source, title, artist, started_at, ended_at) VALUES ('h1', 'u1', 'spotify', 'Archangel', 'Burial', ?, ?)", [t, t + 60_000]);
  await run("INSERT INTO live_history (id, user_id, source, title, artist, started_at, ended_at) VALUES ('h2', 'u1', 'spotify', 'Archangel', 'Burial', ?, ?)", [t + 2000, t + 90_000]);
  await run("INSERT INTO live_history (id, user_id, source, title, artist, started_at, ended_at) VALUES ('h3', 'u1', 'spotify', 'Other', 'Burial', ?, ?)", [t + 4000, t + 10_000]);

  assert.equal(await dedupeDoubles(await db()), true);

  const sends = await all<{ id: string }>("SELECT id FROM sends WHERE track_id = 't2' ORDER BY created_at");
  assert.deepEqual(
    sends.map((s) => s.id),
    ["s_a", "s_c"],
  );
  assert.deepEqual(await all("SELECT send_id, user_id, status FROM reactions"), [{ send_id: "s_a", user_id: "u2", status: "kept" }]);
  assert.deepEqual(await all("SELECT send_id, via FROM echoes"), [{ send_id: "s_a", via: "played:apple" }]);
  const hist = await all<{ id: string; ended_at: number }>("SELECT id, ended_at FROM live_history ORDER BY started_at");
  assert.deepEqual(
    hist.map((h) => [h.id, Number(h.ended_at)]),
    [
      ["h1", t + 90_000],
      ["h3", t + 10_000],
    ],
  );
});
