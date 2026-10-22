"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { CrewPulse, Window } from "@/lib/pulse";

const ROWS: Array<{ k: keyof Window; label: string; unit?: string }> = [
  { k: "active", label: "People who did anything" },
  { k: "visitors", label: "People who opened it" },
  { k: "visits", label: "Opens" },
  { k: "handSends", label: "Sends by hand" },
  { k: "answered", label: "Sends that got an answer", unit: "%" },
  { k: "reactions", label: "Keeps, played-outs and lines back" },
  { k: "replies", label: "Lines back" },
  { k: "autoSends", label: "Plays and likes that streamed in" },
  { k: "liveSessions", label: "Live sessions" },
  { k: "listeners", label: "People heard on Live" },
  { k: "together", label: "Times two people overlapped" },
];

export function PulseView() {
  const [data, setData] = useState<{ crews: CrewPulse[]; pings: number; people: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ crews: CrewPulse[]; pings: number; people: number }>("/api/pulse")
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, []);
  return (
    <div className="page pulse">
      <div className="page__head">
        <h1 className="display page__title">Pulse</h1>
        {data && (
          <span className="caps num">
            {data.people} people · {data.pings} with pings
          </span>
        )}
      </div>
      <p className="muted" style={{ margin: "6px 0 18px", maxWidth: 560 }}>
        Whether a room is alive, crew by crew: the last 7 days and the last 28. The number that matters most is the share of hand sends that got an answer.
      </p>
      {err && <p className="muted">{err}</p>}
      {data?.crews.map((c) => (
        <section key={c.id} className="pulse__crew" aria-label={c.name}>
          <div className="earlier__head">
            <span className="caps">
              {c.name} · {c.members === 1 ? "1 person" : `${c.members} people`}
            </span>
            <span className="caps">7d · 28d</span>
          </div>
          <table className="pulse__table">
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.k}>
                  <td>{r.label}</td>
                  <td className="readout">
                    {c.week[r.k]}
                    {r.unit ?? ""}
                  </td>
                  <td className="readout faint">
                    {c.month[r.k]}
                    {r.unit ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
