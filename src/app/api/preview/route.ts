import { requireUser } from "@/lib/api";

/**
 * Same-origin proxy for preview audio so the browser can decode it for analysis
 * (the CDNs do not send CORS headers). Only known preview hosts are allowed.
 */
const ALLOWED = [/\.itunes\.apple\.com$/i, /\.mzstatic\.com$/i, /\.dzcdn\.net$/i, /\.deezer\.com$/i];

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const u = new URL(req.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(u);
  } catch {
    return new Response("Bad URL", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.some((re) => re.test(target.hostname))) {
    return new Response("Host not allowed", { status: 403 });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(target, { signal: ctrl.signal });
    if (!r.ok || !r.body) return new Response("Upstream error", { status: 502 });
    return new Response(r.body, {
      status: 200,
      headers: {
        "content-type": r.headers.get("content-type") ?? "audio/mp4",
        "cache-control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("Upstream timeout", { status: 504 });
  } finally {
    clearTimeout(t);
  }
}
