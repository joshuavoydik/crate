/**
 * The one secret everything hangs on: it signs sessions and wraps every stored token. A dev
 * checkout may run without one; a production build refuses to, because a known default would
 * let anyone forge a session or read the tokens.
 */
const DEV_FALLBACK = "crate-dev-secret-change-me-in-production";

export function sessionSecret(): string {
  const s = (process.env.SESSION_SECRET ?? "").trim();
  if (s && s !== DEV_FALLBACK && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && !process.env.CRATE_ALLOW_DEV_SECRET) {
    throw new Error("SESSION_SECRET is not set (or too short). Set a long random string before running Crate in production.");
  }
  return s || DEV_FALLBACK;
}
