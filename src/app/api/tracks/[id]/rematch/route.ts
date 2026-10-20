import { json, error, readJson, requireUser, str } from "@/lib/api";
import { getTrack } from "@/lib/queries";
import { candidatesApple, lookupApple } from "@/lib/resolve/itunes";
import { accentFromImage } from "@/lib/resolve/color";
import { fingerprint } from "@/lib/resolve/parse";
import { one, run } from "@/lib/db";
import { canTouchTrack } from "@/lib/maker";
import { publicHttpUrl } from "@/lib/safe-url";

/**
 * When the resolver picked the wrong version or artwork. GET lists catalog candidates;
 * POST { appleId } swaps the track's catalog fields to that pick (or { artworkUrl } to set art directly).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const track = await getTrack(id);
  if (!track) return error("Unknown track", 404);
  if (!(await canTouchTrack(auth.user.id, id))) return error("Not your track", 403);
  const candidates = await candidatesApple(track.artist || undefined, track.title, 8);
  return json({
    candidates: candidates.map((c) => ({
      appleId: c.appleId,
      artist: c.artist,
      title: c.title,
      album: c.album,
      artworkUrl: c.artworkUrl,
      previewUrl: c.previewUrl,
      year: c.year,
    })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const track = await getTrack(id);
  if (!track) return error("Unknown track", 404);
  if (!(await canTouchTrack(auth.user.id, id))) return error("Not your track", 403);
  const body = await readJson<{ appleId?: string; artworkUrl?: string }>(req);
  const appleId = str(body?.appleId, 40);
  const artworkUrl = str(body?.artworkUrl, 2000);
  if (!appleId && !artworkUrl) return error("Pick a version or an artwork");
  if (artworkUrl && !(await publicHttpUrl(artworkUrl))) return error("Artwork needs to be a public https image link");

  if (appleId) {
    const c = await lookupApple(appleId).catch(() => null);
    if (!c) return error("That version could not be loaded", 404);
    const accent = c.artworkUrl ? await accentFromImage(c.artworkUrl) : track.accent;
    const fp = fingerprint(c.artist, c.title, c.appleId);
    const clash = await one<{ id: string }>("SELECT id FROM tracks WHERE fingerprint = ? AND id != ?", [fp, id]);
    const links = { ...track.links, apple: c.appleUrl ? { url: c.appleUrl, direct: true } : track.links.apple };
    await run(
      `UPDATE tracks SET artist = ?, title = ?, album = ?, artwork_url = ?, preview_url = COALESCE(?, preview_url), genre = ?, duration_ms = ?, year = ?, links_json = ?, accent = ?, apple_id = ?, fingerprint = ?, bpm = NULL, key_name = NULL, camelot = NULL, energy = NULL WHERE id = ?`,
      [
        c.artist,
        c.title,
        c.album,
        c.artworkUrl,
        c.previewUrl,
        c.genre,
        c.durationMs,
        c.year,
        JSON.stringify(links),
        accent ?? null,
        clash ? track.appleId : c.appleId,
        clash ? track.id : fp,
        id,
      ],
    );
    return json({ track: await getTrack(id) });
  }
  const accent = await accentFromImage(artworkUrl!);
  await run("UPDATE tracks SET artwork_url = ?, accent = COALESCE(?, accent) WHERE id = ?", [artworkUrl, accent, id]);
  return json({ track: await getTrack(id) });
}
