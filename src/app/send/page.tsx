import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { Reel } from "@/components/Reel";
import { Welcome } from "@/components/Welcome";
import { extractUrl } from "@/lib/resolve/parse";

export const dynamic = "force-dynamic";

/** Share-target landing: /send?url=...&text=...&title=... opens the send flow with the link. */
export default async function SendPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pick = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const incoming = extractUrl(pick("url"), pick("text"), pick("title"));
  const me = await loadMe();
  if (!me) return <Welcome />;
  return (
    <Shell initialMe={me} active="reel" incomingUrl={incoming}>
      <Reel />
    </Shell>
  );
}
