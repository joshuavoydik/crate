import { json, error, readJson, requireUser } from "@/lib/api";
import { getTrack, saveAnalysis } from "@/lib/queries";

/** The browser analyzes the preview and saves BPM, key and energy back to the track. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson<{ bpm?: number; keyName?: string; camelot?: string; energy?: number }>(req);
  if (!body) return error("Bad JSON");
  const track = await getTrack(id);
  if (!track) return error("Unknown track", 404);
  const bpm = typeof body.bpm === "number" && body.bpm > 40 && body.bpm < 260 ? Math.round(body.bpm * 10) / 10 : null;
  const keyName = typeof body.keyName === "string" && /^[A-G]#? (major|minor)$/.test(body.keyName) ? body.keyName : null;
  const camelot = typeof body.camelot === "string" && /^(1[0-2]|[1-9])[AB]$/.test(body.camelot) ? body.camelot : null;
  const energy = typeof body.energy === "number" && body.energy >= 1 && body.energy <= 10 ? Math.round(body.energy) : null;
  if (bpm === null && keyName === null) return error("Nothing to save");
  await saveAnalysis(id, {
    bpm: bpm ?? track.bpm,
    keyName: keyName ?? track.keyName,
    camelot: camelot ?? track.camelot,
    energy: energy ?? track.energy,
  });
  return json({ track: await getTrack(id) });
}
