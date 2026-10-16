import { redirect } from "next/navigation";
import { loadMe } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { DayView } from "@/components/DayView";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const me = await loadMe();
  if (!me) redirect("/");
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/days");
  return (
    <Shell initialMe={me} active="reel">
      <DayView date={date} />
    </Shell>
  );
}
