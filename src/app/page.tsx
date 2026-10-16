import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { PlaylistView } from "@/components/PlaylistView";
import { Welcome } from "@/components/Welcome";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await loadMe();
  if (!me) return <Welcome />;
  return (
    <Shell initialMe={me} active="reel">
      <PlaylistView />
    </Shell>
  );
}
