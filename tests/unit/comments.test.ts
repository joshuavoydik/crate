import { test, before } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

const FILE = "./data/unit-comments.db";
before(() => {
  for (const f of [FILE, `${FILE}-journal`, `${FILE}-wal`, `${FILE}-shm`]) rmSync(f, { force: true });
  process.env.DATABASE_URL = `file:${FILE}`;
  process.env.SESSION_SECRET = "unit-test-secret-long-enough-0123456789";
});

test("a thread under a song: anyone in the crew adds to it, only you take yours back, the sender hears about it", async () => {
  const { run } = await import("../../src/lib/db.ts");
  const { commentsOn, addComment, deleteComment } = await import("../../src/lib/comments.ts");
  const { backNotices } = await import("../../src/lib/notices.ts");
  const { logFor } = await import("../../src/lib/log.ts");
  const t = Date.now();
  await run("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Joshua Voydik', ?), ('u2', 'Dana Zoe', ?), ('u3', 'Theo Marsh', ?)", [t, t, t]);
  await run("INSERT INTO crews (id, name, invite_code, created_by, created_at) VALUES ('c1', 'Night Shift', 'ns-crew', 'u1', ?)", [t]);
  await run("INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES ('c1', 'u1', ?), ('c1', 'u2', ?), ('c1', 'u3', ?)", [t, t, t]);
  await run("INSERT INTO tracks (id, fingerprint, artist, title, created_at) VALUES ('t1', 'f1', 'Emancipator', 'Tiger Moth', ?)", [t]);
  await run("INSERT INTO sends (id, crew_id, track_id, from_user_id, note, note_by, created_at, via) VALUES ('s1', 'c1', 't1', 'u1', 'trust me', 'human', ?, 'app')", [t]);

  assert.deepEqual(await commentsOn("s1"), []);
  const a = await addComment("s1", "u2", "ok that bridge");
  const b = await addComment("s1", "u3", "late to this, wow");
  const list = await commentsOn("s1");
  assert.deepEqual(
    list.map((c) => [c.person.name, c.body]),
    [
      ["Dana Zoe", "ok that bridge"],
      ["Theo Marsh", "late to this, wow"],
    ],
  );
  // Theo cannot delete Dana's; Dana can delete her own.
  assert.equal(await deleteComment(a.id, "u3"), false);
  assert.equal(await deleteComment(a.id, "u2"), true);
  assert.equal((await commentsOn("s1")).length, 1);
  // The sender sees it under the bell and in History's "back to you".
  const notices = await backNotices("u1", new Set());
  assert.ok(notices.some((n) => n.id === `back:c:${b.id}` && n.title === "Theo wrote back on Tiger Moth"));
  const log = await logFor("u1", 50);
  assert.ok(log.some((i) => i.action === "back" && i.detail === "Theo: late to this, wow"));
});
