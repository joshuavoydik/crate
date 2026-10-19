import { notFound } from "next/navigation";
import { collectionByPublicCode } from "@/lib/collections";
import { PublicPlaylistView } from "@/components/PublicPlaylistView";

export const dynamic = "force-dynamic";

/** A playlist's own page: anyone with the link, no account. */
export default async function PublicPlaylistPage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const found = await collectionByPublicCode(code);
  if (!found) notFound();
  return <PublicPlaylistView code={code} name={found.collection.name} crewName={found.crewName} />;
}
