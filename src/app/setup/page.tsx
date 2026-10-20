import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { SetupView } from "@/components/SetupView";

export const dynamic = "force-dynamic";

/** The one-time developer registration, for whoever runs this Crate. Not part of the everyday app. */
export default async function SetupPage() {
  const me = await loadMe();
  if (!me) redirect("/");
  if (!me.isMaker) redirect("/settings");
  return (
    <Shell initialMe={me} active="settings">
      <Suspense fallback={null}>
        <SetupView />
      </Suspense>
    </Shell>
  );
}
