import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { ConnectView } from "@/components/ConnectView";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const me = await loadMe();
  if (!me) redirect("/");
  return (
    <Shell initialMe={me} active="settings">
      <ConnectView />
    </Shell>
  );
}
