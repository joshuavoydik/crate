import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { PlaylistView } from "@/components/PlaylistView";
import { Welcome } from "@/components/Welcome";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await loadMe();
  if (!me) return <Welcome />;
  const sp = await searchParams;
  return (
    <Shell initialMe={me} active="log">
      <PlaylistView welcome={sp.welcome === "1"} />
    </Shell>
  );
}
