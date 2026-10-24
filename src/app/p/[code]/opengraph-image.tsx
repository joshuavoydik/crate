import { card, OG_SIZE } from "@/lib/og";
import { collectionByPublicCode } from "@/lib/collections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A playlist on Crate";

/** The card for a playlist's link: its name, who it is from, its covers. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const found = await collectionByPublicCode(code);
  if (!found) return card({ kicker: "On Crate", title: "Crate", line: "Music between friends, with memory.", covers: [] });
  const { collection, crewName } = found;
  return card({
    kicker: `A playlist from ${crewName}`,
    title: collection.name,
    line: `${collection.count} ${collection.count === 1 ? "track" : "tracks"}${collection.day ? " · a day of the log" : ""}`,
    covers: collection.covers,
  });
}
