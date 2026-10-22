import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { PulseView } from "@/components/PulseView";

export const dynamic = "force-dynamic";

/** The maker's page: is anyone alive in here? */
export default async function PulsePage() {
  const me = await loadMe();
  if (!me) redirect("/");
  if (!me.isMaker) redirect("/settings");
  return (
    <Shell initialMe={me} active="settings">
      <PulseView />
    </Shell>
  );
}
