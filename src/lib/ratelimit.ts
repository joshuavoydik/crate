import { error } from "./api";

/**
 * A small brake on the doors that need one: signing up, joining, sending, pasting links and the
 * helper's reports. Counted in memory per server (a serverless instance counts its own), which is
 * enough to turn a script into a trickle without ever getting in a person's way.
 */
type Bucket = { n: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let sweptAt = 0;

export function allow(key: string, limit: number, windowMs: number): boolean {
  const t = Date.now();
  if (t - sweptAt > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt < t) buckets.delete(k);
    sweptAt = t;
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < t) {
    buckets.set(key, { n: 1, resetAt: t + windowMs });
    return true;
  }
  b.n++;
  return b.n <= limit;
}

/** The caller's address as the proxy reports it; "local" when there is none. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
  return fwd.split(",")[0].trim() || "local";
}

/** A 429 when the key is over its limit, else null. */
export function throttled(key: string, limit: number, windowMs = 60_000): Response | null {
  return allow(key, limit, windowMs) ? null : error("Too many requests; give it a minute", 429);
}
