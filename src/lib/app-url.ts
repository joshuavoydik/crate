/**
 * The app's public address, for invite links, the Chrome extension's pairing, the Mac helper,
 * OAuth callbacks and sign-in links. NEXT_PUBLIC_APP_URL when it is set; on Vercel without it
 * (or with a localhost one left over from a .env), the project's production domain, else this
 * deployment's; locally, localhost:3000. A hosted Crate never hands out a localhost address.
 */
export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  const set = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "";
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(set);
  if (set && !(env.VERCEL && local)) return set;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return set || "http://localhost:3000";
}
