"use client";

import { useEffect, useState } from "react";
import { api, timeAgo, sourceName } from "@/lib/client";
import type { Problems } from "@/lib/problems";

export function ProblemsView() {
  const [data, setData] = useState<Problems | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Problems>("/api/problems")
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, []);
  const quiet = data && !data.sources.length && !data.pushes.length;
  return (
    <div className="page problems">
      <div className="page__head">
        <h1 className="display page__title">Problems</h1>
      </div>
      <p className="muted" style={{ margin: "6px 0 18px", maxWidth: 560 }}>
        What is quietly broken, so nobody has to tell you: sources that stopped syncing or want a reconnect, devices whose pings fail, and when the crons last ran.
      </p>
      {err && <p className="muted">{err}</p>}
      {quiet && <p className="caps" style={{ color: "var(--signal)" }}>Nothing is broken.</p>}

      {data && data.sources.length > 0 && (
        <section className="pulse__crew" aria-label="Sources in trouble">
          <div className="earlier__head">
            <span className="caps">Sources in trouble</span>
          </div>
          <table className="pulse__table">
            <tbody>
              {data.sources.map((s, i) => (
                <tr key={i}>
                  <td>
                    {s.who} · {sourceName(s.kind)}
                    <div className="faint" style={{ fontSize: 12.5 }}>
                      {s.status === "reauth" ? "Wants a reconnect" : "Sync error"}
                      {s.error ? `: ${s.error}` : ""}
                    </div>
                  </td>
                  <td className="readout">{s.lastSyncAt ? timeAgo(s.lastSyncAt) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data && data.pushes.length > 0 && (
        <section className="pulse__crew" aria-label="Pings failing">
          <div className="earlier__head">
            <span className="caps">Pings failing</span>
          </div>
          <table className="pulse__table">
            <tbody>
              {data.pushes.map((p, i) => (
                <tr key={i}>
                  <td>
                    {p.who}
                    <div className="faint" style={{ fontSize: 12.5 }}>{p.ua ?? "unknown device"}</div>
                  </td>
                  <td className="readout">{p.fails} fails</td>
                  <td className="readout faint">{p.lastOkAt ? timeAgo(p.lastOkAt) : "never ok"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data && (
        <section className="pulse__crew" aria-label="Crons">
          <div className="earlier__head">
            <span className="caps">Crons</span>
          </div>
          <table className="pulse__table">
            <tbody>
              {data.crons.map((c) => (
                <tr key={c.name}>
                  <td>{c.name === "sync" ? "Daily sync (07:17 UTC)" : "Weekly recap (Monday 02:17 UTC)"}</td>
                  <td className="readout">{c.at ? timeAgo(c.at) : "not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data && data.people.length > 0 && (
        <section className="pulse__crew" aria-label="People">
          <div className="earlier__head">
            <span className="caps">People</span>
            <span className="caps">crews · sources · last seen</span>
          </div>
          <table className="pulse__table">
            <tbody>
              {data.people.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td className="readout">{p.crews}</td>
                  <td className="readout">{p.sources}</td>
                  <td className="readout faint">{p.lastSeen ? timeAgo(p.lastSeen) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
