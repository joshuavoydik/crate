"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";

export type Landing =
  | { kind: "device"; name: string }
  | { kind: "email"; email: string; name: string | null; attachTo: string | null }
  | { kind: "spent" }
  | { kind: "invalid" };

/**
 * Where a sign-in link lands: a page with one button, so that a messaging app fetching the link
 * for a preview does not spend it. A new address asks for a name; everything else is a press.
 */
export function LinkLanding({ token, landing }: { token: string; landing: Landing }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needName = landing.kind === "email" && !landing.name && !landing.attachTo;

  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ ok?: boolean; next?: string; needName?: boolean }>("/api/auth/finish", { method: "POST", json: { token, name: name.trim() || undefined } });
      if (r.needName) {
        setErr("Tell us your name first");
        setBusy(false);
        return;
      }
      router.replace(r.next || "/");
      router.refresh();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  if (landing.kind === "invalid" || landing.kind === "spent") {
    return (
      <div className="welcome">
        <h1 className="display welcome__mark">Crate</h1>
        <p className="welcome__tag">{landing.kind === "spent" ? "That link was already used. Each one works once." : "That link is not valid any more. Links work for a day (a device link) or an hour (an email one)."}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/signin" className="btn btn--primary">
            Sign in another way
          </Link>
          <Link href="/" className="btn btn--ghost">
            Front page
          </Link>
        </div>
      </div>
    );
  }

  const lead =
    landing.kind === "device"
      ? `This signs you in as ${landing.name} on this device.`
      : landing.attachTo
        ? `This attaches ${landing.email} to ${landing.attachTo}'s account, so it can sign in with that address from now on.`
        : landing.name
          ? `Welcome back, ${landing.name.split(" ")[0]}. This signs you in on this device.`
          : `${landing.email} is new here. A name, and you are in.`;

  return (
    <div className="welcome">
      <h1 className="display welcome__mark">Crate</h1>
      <p className="welcome__tag">{lead}</p>
      <form className="welcome__form" onSubmit={go}>
        {needName && (
          <>
            <label className="label caps" htmlFor="landing-name">
              Your name
            </label>
            <input
              id="landing-name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First name is fine"
              autoFocus
              required
              maxLength={60}
              autoComplete="name"
              autoCapitalize="words"
            />
          </>
        )}
        {err && (
          <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
            {err}
          </p>
        )}
        <div style={{ marginTop: needName ? 24 : 0, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn--primary" type="submit" disabled={busy || (needName && !name.trim())} data-testid="landing-go">
            {busy ? "…" : landing.kind === "device" ? `Sign in as ${landing.name.split(" ")[0]}` : landing.attachTo ? "Attach this address" : landing.name ? "Sign in" : "Join"}
          </button>
        </div>
      </form>
      <p className="faint signin__foot">Not you? Close this page; nothing happens until the button is pressed.</p>
    </div>
  );
}
