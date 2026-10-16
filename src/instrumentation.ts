/**
 * Runs once when the server starts. The Node runtime gets the sync loop; the edge runtime gets
 * nothing. The branch on NEXT_RUNTIME is the documented shape: the bundler drops the other side,
 * so the edge build never tries to bundle the sync code (which reaches into sharp and SQLite).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
