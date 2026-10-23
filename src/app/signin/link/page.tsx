import { getUser, readEmailLink, readSignInLink, spent, userByEmail } from "@/lib/auth";
import { LinkLanding, type Landing } from "@/components/LinkLanding";

export const dynamic = "force-dynamic";

/** A sign-in link lands here. Reading it changes nothing; the button on the page does. */
export default async function LinkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = sp.token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const landing = await describe(token);
  return <LinkLanding token={token} landing={landing} />;
}

async function describe(token: string): Promise<Landing> {
  if (!token) return { kind: "invalid" };
  const uid = await readSignInLink(token);
  if (uid) {
    if (await spent(token)) return { kind: "spent" };
    const u = await getUser(uid);
    return u ? { kind: "device", name: u.name } : { kind: "invalid" };
  }
  const m = await readEmailLink(token);
  if (!m) return { kind: "invalid" };
  if (await spent(token)) return { kind: "spent" };
  const known = await userByEmail(m.email);
  const attachTo = m.link ? await getUser(m.link) : null;
  return { kind: "email", email: m.email, name: known?.name ?? null, attachTo: attachTo?.name ?? null };
}
