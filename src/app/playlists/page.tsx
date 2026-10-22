import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { PlaylistsView } from "@/components/Collections";

export const dynamic = "force-dynamic";

/** The lists people make by hand, and the ones shared with them. */
export default async function PlaylistsPage() {
  const me = await loadMe();
  if (!me) redirect("/");
  return (
    <Shell initialMe={me} active="playlists">
      <PlaylistsView />
    </Shell>
  );
}
