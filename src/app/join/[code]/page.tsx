import { loadMe } from "@/lib/session";
import { crewByCode } from "@/lib/queries";
import { Welcome } from "@/components/Welcome";
import { googleSignInConfigured } from "@/lib/google-signin";
import { JoinExisting } from "@/components/JoinExisting";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const crew = await crewByCode(code);
  if (!crew) {
    return (
      <div className="welcome">
        <h1 className="display welcome__mark">Crate</h1>
        <p className="welcome__tag">That invite link is not valid. Ask for a fresh one.</p>
      </div>
    );
  }
  const me = await loadMe();
  const members = crew.members.map((m) => m.name);
  if (me) {
    return <JoinExisting code={code} crewName={crew.name} members={members} already={crew.members.some((m) => m.id === me.id)} meName={me.name} />;
  }
  return <Welcome invite={{ code, crewName: crew.name, members }} google={await googleSignInConfigured()} />;
}
