"use client";

/** The last resort, when the layout itself fails: plain, with the message in it. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "48px 24px", maxWidth: 640, margin: "0 auto", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Crate</h1>
        <p style={{ margin: "0 0 16px", opacity: 0.7 }}>Something broke before the page could load.</p>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 14, borderRadius: 12, background: "rgba(127,127,127,0.12)", fontSize: 13 }}>
          {error.message || "No message"}
          {error.digest ? `\n\ndigest ${error.digest}` : ""}
        </pre>
        <p>
          <button onClick={() => reset()} type="button" style={{ padding: "10px 16px", borderRadius: 999, fontSize: 15 }}>
            Try again
          </button>{" "}
          <a href="/" style={{ marginLeft: 12 }}>
            Home
          </a>
        </p>
      </body>
    </html>
  );
}
