import { syncAll } from "./lib/sync";

/**
 * On a server, nobody's browser tab is open to drive the sync, so the server drives it itself:
 * every three minutes, every connected platform for everyone, as long as CRATE_SYNC_LOOP is set.
 * Locally (npm run dev) the open tab does it, as before.
 */
const EVERY = 3 * 60 * 1000;

if (process.env.CRATE_SYNC_LOOP === "1") {
  const tick = async () => {
    try {
      await syncAll();
    } catch (e) {
      console.error("sync loop:", (e as Error).message);
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, EVERY);
}
