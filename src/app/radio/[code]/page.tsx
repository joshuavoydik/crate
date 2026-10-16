import { notFound } from "next/navigation";
import { crewByPublicCode } from "@/lib/playlist";
import { RadioView } from "@/components/RadioView";

export const dynamic = "force-dynamic";

export default async function RadioPage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const crew = await crewByPublicCode(code);
  if (!crew) notFound();
  return <RadioView code={code} crewName={crew.name} />;
}
