import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { CollectionView } from "@/components/CollectionView";

export const dynamic = "force-dynamic";

/** One of the crew's playlists, whole. */
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await loadMe();
  if (!me) redirect("/");
  const { id } = await params;
  return (
    <Shell initialMe={me} active="reel">
      <CollectionView id={id} />
    </Shell>
  );
}
