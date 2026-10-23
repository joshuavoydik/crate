"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { useStore } from "./Store";

/**
 * How this account gets into Crate from anywhere else: a Google account, an email address, or the
 * link from here. An account made from an invite starts with neither, which is why this card is
 * where it is: attach one now and the phone is a tap away.
 */
export function SignInCard() {
  const { me, toast, refreshMe } = useStore();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const googleOn = me.signIn.google;
  const mailOn = me.signIn.email;

  useEffect(() => {
    const linked = sp.get("linked");
    const error = sp.get("error");
    if (linked === "google") toast("Google is attached to your account");
    if (linked === "email") toast("That address signs you in now");
    if (error === "google-taken") toast("That Google account already signs in to a different Crate account");
    else if (error?.startsWith("google")) toast("Google did not go through. Try again.");
    if (linked || error) {
      refreshMe();
      window.history.replaceState(null, "", "/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/email", { method: "POST", json: { email, link: true } });
      setSent(true);
    } catch (x) {
      toast((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const none = !me.email && !me.hasGoogle;
  return (
    <div className="section" style={{ borderTop: 0, paddingTop: 0 }} id="signin">
      <div className="switch">
        <div>
          <div>Your sign-in</div>
          <div className="faint" style={{ fontSize: 13 }}>
            {none
              ? "Nothing is attached to this account yet, so only a link from this device gets you in elsewhere. Attach Google or an email and any device can sign in as you."
              : [me.hasGoogle ? "Google" : null, me.email ? me.email : null].filter(Boolean).join(" · ") + " signs in as you on any device."}
          </div>
        </div>
      </div>
      <div className="signincard__row">
        {googleOn && !me.hasGoogle && (
          <a className="btn btn--sm" href="/api/auth/google?link=1&next=%2Fsettings">
            Attach Google
          </a>
        )}
        {mailOn && !me.email && !adding && (
          <button className="btn btn--sm" onClick={() => setAdding(true)}>
            Attach an email
          </button>
        )}
        {mailOn && me.email && !adding && (
          <button className="btn btn--sm btn--ghost" onClick={() => setAdding(true)}>
            Change email
          </button>
        )}
      </div>
      {adding &&
        (sent ? (
          <p className="faint" style={{ fontSize: 13, margin: "10px 0 0" }}>
            Sent. Open the email on any device and press the button; the address is attached once you do.
          </p>
        ) : (
          <form onSubmit={send} className="signincard__mail">
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              required
              autoComplete="email"
              inputMode="email"
              autoCapitalize="off"
            />
            <button className="btn btn--sm" type="submit" disabled={busy || !email.trim()}>
              {busy ? "…" : "Send the link"}
            </button>
          </form>
        ))}
      {!googleOn && !mailOn && me.isMaker && (
        <p className="faint" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
          Google sign-in uses the Google keys from Setup; email needs Resend or SMTP there.
        </p>
      )}
    </div>
  );
}
