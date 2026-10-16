"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

/** A signed-in person landing on an invite link. */
export function JoinExisting({ code, crewName, members, already }: { code: string; crewName: string; members: string[]; already: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/join", { method: "POST", json: { code } });
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
        {already ? (
          <>
            You are already in <strong style={{ color: "var(--ink)" }}>{crewName}</strong>.
          </>
        ) : (
          <>
            {members.length ? members.map((m) => m.split(" ")[0]).join(" and ") : "Someone"} invited you to{" "}
            <strong style={{ color: "var(--ink)" }}>{crewName}</strong>.
          </>
        )}
      </p>
      {err && (
        <p className="muted" style={{ marginBottom: 12, fontSize: 14 }}>
          {err}
        </p>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        {already ? (
          <button className="btn btn--primary" onClick={() => router.replace("/")}>
            Open the Reel
          </button>
        ) : (
          <button className="btn btn--primary" onClick={join} disabled={busy}>
            Join {crewName}
          </button>
        )}
      </div>
    </div>
  );
}
