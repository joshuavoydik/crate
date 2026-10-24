import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { collectionByPublicCode, isGuest } from "@/lib/collections";
import { isMember } from "@/lib/queries";
import { PublicPlaylistView } from "@/components/PublicPlaylistView";

export const dynamic = "force-dynamic";

/** A playlist's own page: anyone with the link can look; someone already in is taken to it inside the app. */
export default async function PublicPlaylistPage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const found = await collectionByPublicCode(code);
  if (!found) notFound();
  const user = await currentUser();
  if (user && ((await isMember(user.id, found.collection.crewId)) || (await isGuest(found.collection.id, user.id)))) redirect(`/playlists/${found.collection.id}`);
  return <PublicPlaylistView code={code} name={found.collection.name} crewName={found.crewName} signedIn={!!user} />;
}

export async function generateMetadata(props: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await props.params;
  const found = await collectionByPublicCode(code);
  if (!found) return { title: "Crate" };
  const title = `${found.collection.name} · a playlist from ${found.crewName}`;
  const description = `${found.collection.count} ${found.collection.count === 1 ? "track" : "tracks"} on Crate. Open it to hear them.`;
  return { title, description, openGraph: { title, description, type: "music.playlist" }, twitter: { card: "summary_large_image", title, description } };
}
