import Link from "next/link";

/** The page for an address that is not one: the mark, one line, and the way home. */
export default function NotFound() {
  return (
    <div className="welcome">
      <h1 className="display welcome__mark">Crate</h1>
      <p className="welcome__tag">Nothing lives at this address.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Link className="btn btn--primary" href="/">
          Home
        </Link>
        <Link className="btn btn--ghost" href="/live">
          Live
        </Link>
      </div>
    </div>
  );
}
