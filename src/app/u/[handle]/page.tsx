import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { profileByHandle } from "@/lib/profile";
import { ProfileView } from "@/components/ProfileView";

export const dynamic = "force-dynamic";

/** A person's page: the link they post. Off means it is not there, except to its owner. */
export default async function ProfilePage(props: { params: Promise<{ handle: string }> }) {
  const { handle } = await props.params;
  const profile = await profileByHandle(handle);
  const me = await currentUser();
  if (!profile || (profile.level === "off" && me?.id !== profile.person.id)) notFound();
  return <ProfileView handle={profile.handle} name={profile.person.name} />;
}

export async function generateMetadata(props: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await props.params;
  const profile = await profileByHandle(handle);
  if (!profile || profile.level === "off") return { title: "Crate" };
  const title = `${profile.person.name} on Crate`;
  const description = profile.level === "plays" ? `What ${profile.person.name.split(" ")[0]} is playing, lately and right now, and the playlists they have shared.` : `Playlists ${profile.person.name.split(" ")[0]} has shared on Crate.`;
  return { title, description, openGraph: { title, description, type: "profile" }, twitter: { card: "summary_large_image", title, description } };
}
