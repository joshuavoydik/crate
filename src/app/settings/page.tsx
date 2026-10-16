import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadMe, appUrl } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { SettingsView } from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await loadMe();
  if (!me) redirect("/");
  return (
    <Shell initialMe={me} active="settings">
      <Suspense fallback={null}>
        <SettingsView appUrl={appUrl()} />
      </Suspense>
    </Shell>
  );
}
