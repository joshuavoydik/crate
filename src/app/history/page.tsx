import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { LogView } from "@/components/LogView";

export const dynamic = "force-dynamic";

/** Everything this person played, liked, kept or sent, across every crew. Theirs alone. */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await loadMe();
  if (!me) redirect("/");
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  return (
    <Shell initialMe={me} active="history">
      <LogView initialFilter={filter} />
    </Shell>
  );
}
