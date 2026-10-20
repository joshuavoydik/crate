import { test, before } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

const FILE = "./data/unit-collections.db";
before(() => {
  for (const f of [FILE, `${FILE}-journal`, `${FILE}-wal`, `${FILE}-shm`]) rmSync(f, { force: true });
  process.env.DATABASE_URL = `file:${FILE}`;
});

test("a crew's playlists: start one, add a track once, see it, take it out, delete the list", async () => {
  const { run } = await import("../../src/lib/db.ts");
  const { createCollection, collectionsFor, collectionById, addTrack, removeTrack, tracksIn, renameCollection, deleteCollection } = await import("../../src/lib/collections.ts");
  const t = Date.now();
  await run("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Joshua', ?)", [t]);
  await run("INSERT INTO users (id, name, created_at) VALUES ('u2', 'Ariel', ?)", [t]);
  await run("INSERT INTO crews (id, name, invite_code, created_by, created_at) VALUES ('c1', 'Us', 'us', 'u1', ?)", [t]);
  await run("INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES ('c1', 'u1', ?)", [t]);
  await run("INSERT INTO tracks (id, fingerprint, artist, title, artwork_url, created_at) VALUES ('t1', 'fp1', 'Burial', 'Archangel', 'a.jpg', ?)", [t]);
  await run("INSERT INTO tracks (id, fingerprint, artist, title, created_at) VALUES ('t2', 'fp2', 'Four Tet', 'Two Thousand and Seventeen', ?)", [t]);

  const late = await createCollection("c1", "u1", "  Late shift ");
  assert.equal(late.name, "Late shift");
  assert.equal(late.publicCode, "", "no link until someone turns it on");
  assert.equal(late.count, 0);
  assert.ok(await addTrack(late.id, "t1", "u1"));
  assert.equal(await addTrack(late.id, "t1", "u1"), false, "already in");
  assert.ok(await addTrack(late.id, "t2", "u2"), "someone who is not a member any more still counts as who added it");

  const list = await collectionsFor("c1", "t1");
  assert.equal(list.length, 1);
  assert.equal(list[0].count, 2);
  assert.equal(list[0].has, true);
  assert.deepEqual(list[0].covers, ["a.jpg"], "only tracks with artwork make covers");
  assert.equal((await collectionsFor("c1", "t2"))[0].has, true);
  assert.equal((await collectionsFor("c1"))[0].has, undefined);

  const rows = await tracksIn((await collectionById(late.id))!);
  assert.deepEqual(
    rows.map((r) => [r.track.id, r.addedBy.name]),
    [
      ["t1", "Joshua"],
      ["t2", "Ariel"],
    ],
  );

  const { collectionByPublicCode, setCollectionLink } = await import("../../src/lib/collections.ts");
  assert.equal(await collectionByPublicCode(""), null, "an empty code never matches a playlist with its link off");
  const code = await setCollectionLink(late.id, true);
  assert.match(code ?? "", /^[a-z0-9]{10}$/, "turning the link on mints a code");
  assert.equal(await setCollectionLink(late.id, true), code, "turning it on again keeps the same link");
  const shared = await collectionByPublicCode(code!.toUpperCase());
  assert.equal(shared?.collection.id, late.id, "the link finds it, whatever the case");
  assert.equal(shared?.crewName, "Us");
  assert.equal(await collectionByPublicCode("nope"), null);
  assert.equal(await setCollectionLink(late.id, false), null);
  assert.equal(await collectionByPublicCode(code!), null, "a link turned off is gone for good");
  assert.notEqual(await setCollectionLink(late.id, true), code, "turning it back on mints a new one");

  await renameCollection(late.id, "Later");
  assert.equal((await collectionById(late.id))!.name, "Later");
  await removeTrack(late.id, "t1");
  assert.equal((await collectionById(late.id))!.count, 1);
  await deleteCollection(late.id);
  assert.equal(await collectionById(late.id), null);
  assert.deepEqual(await collectionsFor("c1"), []);
});
