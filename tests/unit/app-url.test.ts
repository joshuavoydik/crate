import { test } from "node:test";
import assert from "node:assert/strict";
import { appUrl } from "../../src/lib/app-url.ts";

test("the app's address: what is set, else Vercel's domain, never localhost on a host", () => {
  assert.equal(appUrl({}), "http://localhost:3000");
  assert.equal(appUrl({ NEXT_PUBLIC_APP_URL: "https://crate.example/" }), "https://crate.example");
  assert.equal(appUrl({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "cratemusic.vercel.app", VERCEL_URL: "cratemusic-abc.vercel.app" }), "https://cratemusic.vercel.app");
  assert.equal(appUrl({ VERCEL: "1", VERCEL_URL: "cratemusic-abc.vercel.app" }), "https://cratemusic-abc.vercel.app");
  assert.equal(appUrl({ VERCEL: "1", NEXT_PUBLIC_APP_URL: "http://localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "cratemusic.vercel.app" }), "https://cratemusic.vercel.app", "a localhost left in the env does not win on Vercel");
  assert.equal(appUrl({ VERCEL: "1", NEXT_PUBLIC_APP_URL: "https://cratemusic.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "other.vercel.app" }), "https://cratemusic.vercel.app", "a real setting wins");
  assert.equal(appUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), "http://localhost:3000", "locally, localhost is right");
});
