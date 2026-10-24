import type { Metadata } from "next";
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

export async function generateMetadata(props: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await props.params;
  const crew = await crewByPublicCode(code);
  if (!crew) return { title: "Crate" };
  const title = `${crew.name} on Crate`;
  const description = `${crew.playlistName ?? "A station"}: what ${crew.name} is playing, live, and the playlist so far.`;
  return { title, description, openGraph: { title, description, type: "music.radio_station" }, twitter: { card: "summary_large_image", title, description } };
}
