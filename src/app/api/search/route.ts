import { json, requireUser } from "@/lib/api";
import { searchApple } from "@/lib/resolve/itunes";

/** Catalog search for when there is no link to paste. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return json({ results: [] });
  try {
    const results = await searchApple(q, 6);
    return json({
      results: results.map((r) => ({
        appleId: r.appleId,
        artist: r.artist,
        title: r.title,
        album: r.album,
        artworkUrl: r.artworkUrl,
        previewUrl: r.previewUrl,
        year: r.year,
      })),
    });
  } catch {
    return json({ results: [] });
  }
}
