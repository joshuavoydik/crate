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
      router.replace("/connect");
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
          "Music between friends, with memory. Send anything from anywhere; the agent resolves it, previews it, and remembers what landed."
        )}
      </p>

      {mode === "start" ? (
        <form className="welcome__form" onSubmit={start}>
          <span className="label caps">Your name</span>
          <input className="field" value={yourName} onChange={(e) => setYourName(e.target.value)} placeholder="Joshua" autoFocus required maxLength={60} />
          <span className="label caps">Name the crew</span>
          <input className="field" value={crewName} onChange={(e) => setCrewName(e.target.value)} placeholder="Joshua & Ariel" maxLength={60} />
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
          <span className="label caps">Your name</span>
          <input className="field" value={yourName} onChange={(e) => setYourName(e.target.value)} placeholder="Ariel" autoFocus required maxLength={60} />
          {!invite && (
            <>
              <span className="label caps">Invite link or code</span>
              <input className="field" value={code} onChange={(e) => setCode(e.target.value)} placeholder="https://…/join/abc123" required />
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
        No passwords. Your crew is private to the people with the link. Add Crate to your home screen for the full-screen version.
      </p>
    </div>
  );
}
