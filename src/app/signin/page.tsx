import { redirect } from "next/navigation";
import { currentUser, safeNext } from "@/lib/auth";
import { googleSignInConfigured } from "@/lib/google-signin";
import { mailConfigured } from "@/lib/mail";
import { SignIn } from "@/components/SignIn";

export const dynamic = "force-dynamic";

/** Sign in: for someone with an account already. Signed in and not switching, there is nothing to do here. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const next = safeNext(one(sp.next));
  const me = await currentUser();
  if (me && one(sp.switch) !== "1") redirect(next);
  const [googleOn, mailOn] = await Promise.all([googleSignInConfigured(), mailConfigured()]);
  return <SignIn next={next} error={one(sp.error)} googleOn={googleOn} mailOn={mailOn} signedInAs={me?.name ?? null} />;
}
