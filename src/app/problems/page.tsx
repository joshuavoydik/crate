import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { ProblemsView } from "@/components/ProblemsView";

export const dynamic = "force-dynamic";

/** The maker's page: what is quietly broken. */
export default async function ProblemsPage() {
  const me = await loadMe();
  if (!me) redirect("/");
  if (!me.isMaker) redirect("/settings");
  return (
    <Shell initialMe={me} active="settings">
      <ProblemsView />
    </Shell>
  );
}
