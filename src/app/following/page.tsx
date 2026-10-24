import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { FollowingView } from "@/components/FollowingView";

export const dynamic = "force-dynamic";

export default async function FollowingPage() {
  const me = await loadMe();
  if (!me) redirect("/signin?next=%2Ffollowing");
  return (
    <Shell initialMe={me} active="live">
      <FollowingView />
    </Shell>
  );
}
