import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { PlaylistView } from "@/components/PlaylistView";
import { Welcome } from "@/components/Welcome";
import { googleSignInConfigured } from "@/lib/google-signin";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await loadMe();
  if (!me) return <Welcome google={await googleSignInConfigured()} />;
  // Signed in, in no crew: the same front door, with the name already known.
  if (me.crews.length === 0) return <Welcome me={{ name: me.name }} />;
  const sp = await searchParams;
  return (
    <Shell initialMe={me} active="log">
      <PlaylistView welcome={sp.welcome === "1"} />
    </Shell>
  );
}
