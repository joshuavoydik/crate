import Link from "next/link";

export const metadata = { title: "Terms · Crate" };

/** The deal, in plain words. */
export default function TermsPage() {
  return (
    <div className="page plain">
      <div className="page__head">
        <h1 className="display page__title">Terms</h1>
      </div>
      <div className="plain__body">
        <p>Crate is a small, private app for sharing music with people you know. Using it means agreeing to this page, which is short on purpose.</p>

        <h2 className="caps">What you can do</h2>
        <p>
          Share songs, notes and what you play with your crews. Connect the platforms you have accounts on; Crate uses them within their own terms, and
          whole-song playback through Spotify needs a Spotify Premium account, as Spotify requires.
        </p>

        <h2 className="caps">What you should not do</h2>
        <p>
          Bring in people who did not ask to be there, send things that would get you thrown out of a friend&rsquo;s living room, or try to get at what is
          not yours. The person running this Crate can remove anyone, and will.
        </p>

        <h2 className="caps">What Crate promises</h2>
        <p>
          To keep your data as the <Link href="/privacy">privacy page</Link> says, and to try to keep running. It is a side project, offered as is, with no
          guarantee that it is up, that a play was caught, or that a song is where a link says it is.
        </p>

        <p className="faint" style={{ marginTop: 28 }}>
          <Link href="/privacy">Privacy</Link> · <Link href="/">Home</Link>
        </p>
      </div>
    </div>
  );
}
