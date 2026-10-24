import { card, OG_SIZE } from "@/lib/og";
import { profileByHandle, liveOne, recentPlaysOf, publicPlaylistsOf } from "@/lib/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A person on Crate";

/** The card for a person's link: their name, what is playing (or played lately), the covers. */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const p = await profileByHandle(handle);
  if (!p || p.level === "off") return card({ kicker: "On Crate", title: "Crate", line: "Music between friends, with memory.", covers: [] });
  const first = p.person.name.split(" ")[0];
  if (p.level === "plays") {
    const [live, plays] = await Promise.all([liveOne(p.person), recentPlaysOf(p.person, 8)]);
    const covers = [live.live && live.artworkUrl ? live.artworkUrl : null, ...plays.map((s) => s.artworkUrl)].filter((u): u is string => !!u);
    const line = live.live && live.title ? `Playing now: ${live.title} · ${live.artist ?? ""}` : plays[0] ? `Lately: ${plays[0].title ?? ""} · ${plays[0].artist ?? ""}` : "What they play, as they play it.";
    return card({ kicker: `${first} on Crate`, title: p.person.name, line, covers: [...new Set(covers)], live: live.live });
  }
  const lists = await publicPlaylistsOf(p.person.id);
  const covers = lists.flatMap((l) => l.covers);
  return card({ kicker: `${first} on Crate`, title: p.person.name, line: lists.length ? `${lists.length} ${lists.length === 1 ? "playlist" : "playlists"} shared` : "Playlists, shared.", covers: [...new Set(covers)] });
}
