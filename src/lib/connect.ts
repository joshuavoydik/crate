import { NextResponse } from "next/server";
import { currentUserId } from "./auth";
import { pkce, signState, readState, appUrl, type OAuthState } from "./sources/oauth";
import { saveSource } from "./sync";
import type { SourceKind } from "./sources";

/** Shared pieces of the OAuth start and callback handlers. */

export async function startConnect(kind: SourceKind, buildUrl: (state: string, challenge: string) => Promise<string> | string): Promise<NextResponse> {
  const uid = await currentUserId();
  if (!uid) return NextResponse.redirect(`${appUrl()}/?connect=signin`);
  const { verifier, challenge } = pkce();
  const state = await signState({ uid, kind, verifier, back: "/settings" });
  return NextResponse.redirect(await buildUrl(state, challenge));
}

export async function finishConnect(
  req: Request,
  kind: SourceKind,
  exchange: (code: string, state: OAuthState) => Promise<{ token: Record<string, unknown>; label: string }>,
): Promise<NextResponse> {
  const url = new URL(req.url);
  const back = `${appUrl()}/settings`;
  const err = url.searchParams.get("error");
  if (err) return NextResponse.redirect(`${back}?connect=${kind}&error=${encodeURIComponent(err)}`);
  const state = await readState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!state || state.kind !== kind || !code) return NextResponse.redirect(`${back}?connect=${kind}&error=state`);
  try {
    const { token, label } = await exchange(code, state);
    await saveSource({ userId: state.uid, kind, label, token });
    return NextResponse.redirect(`${back}?connect=${kind}&ok=1`);
  } catch (e) {
    return NextResponse.redirect(`${back}?connect=${kind}&error=${encodeURIComponent((e as Error).message.slice(0, 120))}`);
  }
}
