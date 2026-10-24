import { card, OG_SIZE } from "@/lib/og";
import { crewByPublicCode, publicSends } from "@/lib/playlist";
import { liveFor } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A station on Crate";

/** The card for a station's link: the crew, who is on air, the latest covers. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const crew = await crewByPublicCode(code);
  if (!crew) return card({ kicker: "On Crate", title: "Crate", line: "Music between friends, with memory.", covers: [] });
  const [people, sends] = await Promise.all([liveFor(crew.id), publicSends(crew.id, 8)]);
  const live = people.filter((p) => p.live && p.track);
  const covers = [...live.map((p) => p.artworkUrl), ...sends.map((s) => s.track.artworkUrl)].filter((u): u is string => !!u);
  const line = live[0] ? `On air: ${live[0].person.name.split(" ")[0]} playing ${live[0].title ?? ""}` : `${crew.name}'s station`;
  return card({ kicker: crew.playlistName ?? "A station on Crate", title: crew.name, line, covers: [...new Set(covers)], live: live.length > 0 });
}
