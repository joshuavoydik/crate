"use client";

import { useEffect } from "react";

/**
 * What a page shows when something in it throws: the message itself, not a shrug, so whoever
 * sees it can say what it said. Reload tries again; the link goes home.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="welcome" role="alert">
      <h1 className="display welcome__mark">Crate</h1>
      <p className="welcome__tag">Something broke on this page.</p>
      <pre className="errorpage__msg">
        {error.message || "No message"}
        {error.digest ? `\n\ndigest ${error.digest}` : ""}
      </pre>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn--primary" onClick={() => reset()} type="button">
          Try again
        </button>
        <a className="btn btn--ghost" href="/">
          Home
        </a>
        <a className="btn btn--ghost" href="/live">
          Live
        </a>
      </div>
    </div>
  );
}
