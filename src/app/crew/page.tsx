import { redirect } from "next/navigation";
import { loadMe, appUrl } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { CrewView } from "@/components/CrewView";

export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const me = await loadMe();
  if (!me) redirect("/");
  return (
    <Shell initialMe={me} active="crew">
      <CrewView appUrl={appUrl()} />
    </Shell>
  );
}
