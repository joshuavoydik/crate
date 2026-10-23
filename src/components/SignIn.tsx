"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

const ERRORS: Record<string, string> = {
  "google-off": "Google sign-in is not switched on in this Crate yet.",
  "google-denied": "Google did not let us in. Try again.",
  "google-failed": "Google did not answer properly. Try again in a moment.",
  "google-state": "That took too long. Start again.",
  "google-taken": "That Google account already signs in to a different Crate account.",
};

/**
 * The door for someone who already has an account: Google, an email link, or the link from a
 * device that is already in. New people start from the front page.
 */
export function SignIn({ next, error, googleOn, mailOn, signedInAs }: { next: string; error: string | null; googleOn: boolean; mailOn: boolean; signedInAs: string | null }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(error ? (ERRORS[error] ?? "Something went wrong. Try again.") : null);
  const q = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/auth/email", { method: "POST", json: { email, next } });
      setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <h1 className="display welcome__mark">Crate</h1>
      <p className="welcome__tag">{signedInAs ? `Signed in as ${signedInAs}. Sign in as someone else here.` : "Welcome back. Sign in the way you did before, or with the address on your account."}</p>

      <div className="welcome__form signin">
        {googleOn && (
          <a className="btn btn--primary signin__google" href={`/api/auth/google${q}`} data-testid="google-signin">
            Continue with Google
          </a>
        )}

        {mailOn &&
          (sent ? (
            <p className="signin__sent" role="status">
              Sent. Open the link in the email on this device and press the button there. It works for an hour.
            </p>
          ) : (
            <form onSubmit={send} className="signin__mail">
              <label className="label caps" htmlFor="signin-email">
                {googleOn ? "Or your email" : "Your email"}
              </label>
              <input
                id="signin-email"
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
              />
              <button className="btn" type="submit" disabled={busy || !email.trim()} style={{ marginTop: 12 }}>
                {busy ? "…" : "Email me a sign-in link"}
              </button>
            </form>
          ))}

        {!googleOn && !mailOn && (
          <p className="muted" style={{ fontSize: 14 }}>
            This Crate has no Google or email sign-in switched on yet. The link from a device you are already signed in on still works: open Crate there, Settings, Crate on
            another device.
          </p>
        )}

        {err && (
          <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>
            {err}
          </p>
        )}
      </div>

      <p className="faint signin__foot">
        Already signed in on another device? Open Crate there, Settings, Crate on another device, and send yourself the link.
      </p>
      <p className="faint signin__foot">
        New here?{" "}
        <Link href={next.startsWith("/join/") ? next : "/"} style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
          {next.startsWith("/join/") ? "Back to the invite" : "Start a crew or use an invite"}
        </Link>
      </p>
    </div>
  );
}
