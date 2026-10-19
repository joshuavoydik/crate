import { redirect } from "next/navigation";
import { loadMe, appUrl } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { ChromeView } from "@/components/ChromeView";

export const dynamic = "force-dynamic";

/** Crate in Chrome: what it is, the download, the three steps. */
export default async function ChromePage() {
  const me = await loadMe();
  if (!me) redirect("/");
  return (
    <Shell initialMe={me} active="settings">
      <ChromeView appUrl={appUrl()} />
    </Shell>
  );
}
