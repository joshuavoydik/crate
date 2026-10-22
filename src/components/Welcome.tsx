"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function Welcome({ invite }: { invite?: { code: string; crewName: string; members: string[] } | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"start" | "join">(invite ? "join" : "start");
  const [yourName, setYourName] = useState("");
  const [crewName, setCrewName] = useState("");
  const [code, setCode] = useState(invite?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/crews", { method: "POST", json: { yourName, name: crewName || `${yourName.split(" ")[0]}'s crew` } });
      router.replace("/connect");
      router.refresh();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const c = code.trim().split("/").filter(Boolean).pop() ?? "";
    try {
      await api("/api/join", { method: "POST", json: { yourName, code: c } });
      router.replace("/?welcome=1");
      router.refresh();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="glow" style={{ top: "-10%", left: "-10%" }} />
      <h1 className="display welcome__mark">Crate</h1>
      <p className="welcome__tag">
        {invite ? (
          <>
            {invite.members.length ? invite.members.map((m) => m.split(" ")[0]).join(" and ") : "Someone"} invited you to{" "}
            <strong style={{ color: "var(--ink)" }}>{invite.crewName}</strong>.
          </>
        ) : (
          "Music between friends, with memory. What you play shows up for your crew as you play it, and is kept. Only the crew ever sees it."
        )}
      </p>

      {mode === "start" ? (
        <form className="welcome__form" onSubmit={start}>
          <label className="label caps" htmlFor="start-name">
            Your name
          </label>
          <input
            id="start-name"
            className="field"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            placeholder="First name is fine"
            autoFocus
            required
            maxLength={60}
            autoComplete="name"
            autoCapitalize="words"
          />
          <label className="label caps" htmlFor="start-crew">
            Name the crew
          </label>
          <input id="start-crew" className="field" value={crewName} onChange={(e) => setCrewName(e.target.value)} placeholder="Optional; you can rename it later" maxLength={60} autoComplete="off" />
          {err && (
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              {err}
            </p>
          )}
          <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn--primary" type="submit" disabled={busy || !yourName.trim()}>
              Start a crew
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setMode("join")}>
              I have an invite
            </button>
          </div>
        </form>
      ) : (
        <form className="welcome__form" onSubmit={join}>
          <label className="label caps" htmlFor="join-name">
            Your name
          </label>
          <input
            id="join-name"
            className="field"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            placeholder="First name is fine"
            autoFocus
            required
            maxLength={60}
            autoComplete="name"
            autoCapitalize="words"
          />
          {!invite && (
            <>
              <label className="label caps" htmlFor="join-code">
                Invite link or code
              </label>
              <input
                id="join-code"
                className="field"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="https://…/join/abc123"
                required
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
              />
            </>
          )}
          {err && (
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              {err}
            </p>
          )}
          <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn--primary" type="submit" disabled={busy || !yourName.trim() || !code.trim()}>
              Join {invite?.crewName ?? "the crew"}
            </button>
            {!invite && (
              <button className="btn btn--ghost" type="button" onClick={() => setMode("start")}>
                Start a crew instead
              </button>
            )}
          </div>
        </form>
      )}
      <p className="faint" style={{ marginTop: 40, fontSize: 12.5, maxWidth: "40ch" }}>
        No passwords: the invite link is the key. Add Crate to your home screen for the full-screen version.
      </p>
      <p className="faint" style={{ marginTop: 10, fontSize: 12.5, maxWidth: "40ch" }}>
        Already in a crew on another device? Open Crate there, then Settings → Crate on another device, and send yourself the link.
      </p>
      <p className="faint" style={{ marginTop: 10, fontSize: 12.5 }}>
        <a href="/privacy" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
          Privacy
        </a>{" "}
        ·{" "}
        <a href="/terms" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
          Terms
        </a>
      </p>
    </div>
  );
}
