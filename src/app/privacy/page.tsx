import Link from "next/link";

export const metadata = { title: "Privacy · Crate" };

/** What Crate keeps, who sees it, and how to take it back. Plain words, because that is the whole policy. */
export default function PrivacyPage() {
  return (
    <div className="page plain">
      <div className="page__head">
        <h1 className="display page__title">Privacy</h1>
      </div>
      <div className="plain__body">
        <p>Crate is music between friends. This page says what it keeps about you and who can see it.</p>

        <h2 className="caps">What Crate keeps</h2>
        <p>
          Your name and, if you add one, your photo. The songs you play, like, keep or send, with the time, when they come from a platform you connected
          (Spotify, Apple Music, YouTube, SoundCloud, TIDAL, Last.fm), from Crate on your Mac, or from Crate in Chrome. The notes you write on a song. The
          crews you are in. The sign-in token for each platform you connect, stored encrypted and used only to read your plays and likes, to play a song on
          your own Spotify when you ask, and to save a playlist to your account when you ask.
        </p>

        <h2 className="caps">Who sees it</h2>
        <p>
          The people in your crew see what you play, like, keep and send in that crew, as it happens. Nobody else does. A playlist is private to the crew
          unless you turn on its link, and then only people with the link can look. Your history page is yours alone. Nothing in Crate is public, indexed, or
          shown to strangers, and there are no ads.
        </p>

        <h2 className="caps">What Crate does with it</h2>
        <p>
          Shows it to your crew, remembers it for you, and nothing more. Crate does not sell or share your data with anyone. It talks to the platforms you
          connected on your behalf, with the permissions you granted, and to Apple&rsquo;s and Deezer&rsquo;s public catalogs to find artwork and previews.
          Pings (notifications) go through your browser&rsquo;s push service and carry only a title and a line.
        </p>

        <h2 className="caps">Taking it back</h2>
        <p>
          Disconnect a platform in Settings and its token is deleted at once. Turn pings off and that device is forgotten. Leave a crew and your sends stay
          with the crew, your kept tracks stay in your history. To delete your account and everything in it, ask whoever runs this Crate; it is done by hand
          and it is final.
        </p>

        <h2 className="caps">Where it lives</h2>
        <p>Crate runs on Vercel with its database on Turso. The person running this copy of Crate can see the database. Treat it as you would a friend&rsquo;s.</p>

        <p className="faint" style={{ marginTop: 28 }}>
          <Link href="/terms">Terms</Link> · <Link href="/">Home</Link>
        </p>
      </div>
    </div>
  );
}
