import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { LiveView } from "@/components/LiveView";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const me = await loadMe();
  if (!me) redirect("/");
  return (
    <Shell initialMe={me} active="live">
      <LiveView />
    </Shell>
  );
}
