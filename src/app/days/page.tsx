import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { DaysView } from "@/components/DaysView";

export const dynamic = "force-dynamic";

export default async function DaysPage() {
  const me = await loadMe();
  if (!me) redirect("/");
  return (
    <Shell initialMe={me} active="reel">
      <DaysView />
    </Shell>
  );
}
