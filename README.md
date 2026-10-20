# Crate

Music between friends, with memory.

A private channel for passing tracks between two to five people. Paste a link from Spotify, Apple Music, YouTube, SoundCloud, Bandcamp, Beatport, Tidal or Deezer; Crate resolves it to one canonical track with artwork, a 30-second preview, links on every platform, an accent color, and (in the browser) BPM, key and energy. The other person catches up on the stage at the top of their playlist and keeps what lands.

Set up where you already listen and the sends mostly stop being something you do: what you play lands in your log and, by each crew's rule, in its playlist. Plays reach Crate three ways. The **Mac helper** asks the Music, Spotify and SoundCloud apps on a Mac what is on, as it plays. The **Chrome extension** does the same for SoundCloud, YouTube and most music sites in Chrome on a computer. **Connected accounts** sync on their own: Spotify's recently-played history brings plays from any device a few minutes behind (so a phone-only person who connects Spotify is covered); YouTube, SoundCloud and TIDAL accounts bring likes, not plays; Last.fm scrobbles count as plays. Apple Music has no now-playing API, so Music app plays come in through the Mac helper. A second helper on a Mac turns music links texted to you in iMessage into cards at the top of your playlist.

Web first: one Next.js codebase, installable on iOS, Android and desktop as a PWA. On a phone the navigation moves to a bottom bar (Playlist, Live, Log, Send) and every panel becomes a bottom sheet; on a desktop it is a wide stage with a queue beside it. Dark is the default; the sun and moon in the top bar flip it, and Settings → Appearance can pin Auto, Light or Dark.

## The words

One word per thing, everywhere in the app:

- **The playlist** is the crew's shared stream for today, under the name of the moment ("Monday afternoon"). It fills itself from what everyone plays and sends. The Playlist tab is this.
- **Days** are the same stream, earlier: one line per day on the Playlist page under "Earlier", every day by month on `/days`, and each day on its own page.
- **Playlists** (plural, the shelf on the Playlist page) are the lists people put together by hand, track by track. They can be shared by link and saved to Spotify or Apple Music.
- **Your log** is personal: everything you played, liked, kept or sent, across every crew. Nobody else sees it.
- **Live** is what the crew has on right now.

There is no "reel" in the product's copy; the catch-up stage at the top of the playlist is where a send lands.

## Run it locally

```bash
npm install
cp .env.example .env.local     # everything in it is optional for local dev
npm run dev                    # http://localhost:3000
```

Start a crew, copy the invite link, open it in a private window as the second person, send a link both ways.

## Deploy (about 15 minutes)

1. **Database:** create a free [Turso](https://turso.tech) database and copy its `libsql://` URL and auth token. (Any libsql/SQLite host works; locally it is a file.)
2. **Host:** deploy to Vercel (or anything that runs Next.js 15). Set these environment variables:

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | `libsql://...turso.io` in production; `file:./data/crate.db` locally |
| `DATABASE_AUTH_TOKEN` | prod | Turso token |
| `SESSION_SECRET` | yes | long random string; signs the session cookie |
| `NEXT_PUBLIC_APP_URL` | yes | public URL, used in invite links and the iOS Shortcut recipe |
| `ANTHROPIC_API_KEY` | no | agent-written notes and playlist names; templated fallback without it |
| `AGENT_MODEL` | no | defaults to `claude-sonnet-4-5` |
| `LASTFM_API_KEY` | no | lets members add a Last.fm username; scrobbling is the bridge for platforms with no API (Pandora, Amazon Music, Deezer) |
| `CRON_SECRET` | prod | protects `/api/cron/sync` (Vercel sends it on its own) and `/api/admin/import` |

   Turso's Vercel Marketplace integration sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` instead; both spellings work. `vercel.json` schedules `/api/cron/sync` once a day, the most a Hobby plan allows (on Pro, `*/5 * * * *` is fine); the open app still syncs itself every two minutes, and the Mac helper and the Chrome extension report plays as they happen. A Dockerfile and `fly.toml` are there too for a single always-on machine with the SQLite file on a disk; with `CRATE_SYNC_LOOP=1` that server runs the sync loop itself.

3. Open the URL on your phone, add it to the home screen, and share the invite link.

**Moving an existing Crate:** `POST /api/admin/import` with the old SQLite file as the body and `Authorization: Bearer $CRON_SECRET` copies every table over (rows replaced by id) and answers with a one-day sign-in link per person, since cookies from the old address do not carry. Platforms need the new address added as a redirect: Spotify, Google, SoundCloud and TIDAL each in their own dashboard.

The schema is created on first request; there are no migrations to run.

## How a link becomes a card

```
link ──► detectSource()           which platform, any ids in the URL
     ──► platform hints           oEmbed (YouTube, SoundCloud, Spotify), page meta, Apple/Deezer lookups
     ──► cleanVideoTitle()        "Artist - Title (Official Video) [HQ]" → artist + title
     ──► matchApple()             iTunes Search: canonical track, artwork, preview, Apple link
     ──► matchDeezer()            preview fallback (MP3) when Apple has none
     ──► buildLinks()             direct links where known, search links everywhere else
     ──► accentFromImage()        one color sampled from the artwork (sharp)
     ──► upsertTrack()            one Track per recording; the same song from two platforms is one row
     ──► suggestNote()            the agent's one-liner (Claude API, or a templated voice)
```

BPM, key and energy are computed in the browser from the preview (`src/lib/audio/dsp.ts`: banded spectral flux → autocorrelation × Fourier tempogram with a tempo prior; Krumhansl-Schmuckler key profiles on a peak-based chroma; loudness + onset density + brightness for energy) and saved back to the track. On a benchmark of 20 real previews the tempo lands within 4% on 16 and within an octave on the rest; key is an estimate and is shown as one.

## Where plays come from

Right after starting or joining a crew, people land on **Where do you listen?** (`/connect`); later the same thing lives at the top of Settings → Where you listen. Both lead with the two live paths, then the accounts, and both carry one line for phones. The honest version of that line:

| You are on | What works | What it brings |
| --- | --- | --- |
| A phone (any) | Connect Spotify | Plays from any device, a few minutes behind (Spotify's recently-played history, synced every two minutes while the app is open); Live follows the Spotify app too. Last.fm works the same way if you scrobble. |
| A Mac | Crate on your Mac (one download) | The Music, Spotify and SoundCloud apps, as they play; Live lights up at once. The only way Apple Music plays get in. |
| Chrome on a computer | Crate in Chrome (an unpacked extension) | SoundCloud, YouTube, YouTube Music, TIDAL, Deezer, Amazon Music, Pandora, and Apple Music or Spotify on the web, as they play. |
| Anywhere | Send a link by hand | One track, with a line, in front of the crew. |

A YouTube, SoundCloud or TIDAL account brings likes, not plays; nothing on a phone makes those plays visible. The copy in the app says so where each path is offered (first run, Settings, the empty Live page) rather than promising "plays" for every row.

## Connected accounts

For the people using Crate an account is one tap. Tap Spotify, YouTube, SoundCloud or TIDAL and the platform's own sign-in opens with the account already logged in on that device; approve and it comes back connected. Tapping a connected row asks before disconnecting. If the sign-in is cancelled or goes stale, Settings says so in a sentence and offers Try again. Nobody but the maker ever sees a key or a redirect URI.

For the maker there is one page, `/setup` (linked from the bottom of Settings as "App setup"). Each platform makes the app register once before it will hand out logins, so `/setup` walks through that registration per platform, shows the exact redirect URI to paste, and stores the keys encrypted. Until a platform is registered its row is greyed out for everyone with "Not switched on in this Crate yet"; the moment its keys are saved, the row turns into a Connect button. Apple Music is the exception: without Apple keys its row is not greyed but points at Crate on your Mac, since that is how Music app plays come in anyway. Environment variables work too, as defaults.

| Source | What comes in | What it needs | One-time registration (maker only, on `/setup`) |
| --- | --- | --- | --- |
| Spotify | Plays (recently-played history, from any device), liked songs, what is playing now (for Live) | `SPOTIFY_CLIENT_ID` | developer.spotify.com/dashboard → Create app → Redirect URI exactly `http://127.0.0.1:3000/api/connect/spotify/callback` (or your domain) → add each person under User Management (Development Mode allows 5). Connect from `http://127.0.0.1:3000`, not `localhost`, when running locally: Spotify refuses `localhost` redirects. |
| YouTube | Likes only: liked videos (YouTube Music likes included), music category only. YouTube gives nobody watch history. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com → enable YouTube Data API v3 → OAuth client (Web) with redirect `http://localhost:3000/api/connect/youtube/callback` → add yourselves as test users. |
| Apple Music | Recently played (no timestamps; dated at sync time). Optional: the Mac helper brings Music app plays without it. | `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | Apple Developer account → Keys → new key with MusicKit → paste the .p8 contents (newlines as `\n`). |
| SoundCloud | Likes only. Plays come through Crate in Chrome or the Mac helper. | `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET` | An approved SoundCloud API app with redirect `http://localhost:3000/api/connect/soundcloud/callback`. |
| TIDAL | Favorites only. TIDAL exposes no listening history to third parties; plays on TIDAL reach Crate through Last.fm scrobbling or Crate in Chrome. | `TIDAL_CLIENT_ID` (`TIDAL_CLIENT_SECRET` if the dashboard issues one) | developer.tidal.com → create an app with redirect `http://localhost:3000/api/connect/tidal/callback`. |
| Last.fm | Scrobbles (as plays), loved tracks (as likes), now playing (for Live) | `LASTFM_API_KEY` | Type your username. |

**Crate starts from the day you connect.** The first sync of a platform only takes its bookmark; nothing the platform remembers from before is imported. From then on new plays and likes arrive. Not connectable, because there is no public API for a person's listening: Amazon Music (partner program only), Pandora, and Deezer (new apps closed); a Last.fm scrobbler on those gets their plays in, and Crate in Chrome sees them on the web.

Sync runs when the app opens, every two minutes while it is open, and on demand (Settings → Sync now); a scheduler can also hit `GET /api/cron/sync?key=$CRON_SECRET`. Tokens are encrypted at rest with a key derived from `SESSION_SECRET`.

**Wrong version or artwork?** Every track card has that link: it lists the catalog's other versions and swaps the track in one tap. Links from Spotify, SoundCloud, Bandcamp, Deezer and Tidal keep their own artwork from the start; only YouTube links take the catalog's art.

**Removing things.** Open anything in the Log and there is a Remove action at the bottom; it asks first. Your own sends disappear for everyone, kept items leave your list, log entries go away. Disconnecting a source and leaving a crew ask too.

**The rule.** On each crew's page, "Lands here on its own": Everything I play (the default), Just my likes, or Nothing. A play arrives quietly, marked "played on Spotify" (or wherever); a like gets the agent's one-line note. A track already in the playlist this month is not added again, and only what happens after the rule is set counts: connecting a platform never pours its history into a playlist.

## The playlist

Every crew has one running playlist: every play and send, newest first, under a name Crate gives it from the day, the hour and what is in it ("Friday late, moving electronic"). It renames itself as the music changes unless someone in the crew names it by hand (the crew page). New-to-you sends are caught up on the swipe stage at the top; the rest is the list, with previews, notes, who sent what, and Play today. The name also moves with the day: Thursday afternoon becomes Thursday night. A crew of one is still a playlist: your own plays, likes and sends build it until someone joins. The hand-made playlists sit on a shelf under the header, with one line saying which is which.

## Days

The playlist would be an endless page within a month, so it is folded by date. The Playlist page is the viewer's today (everything played or sent since their local midnight, under the name of the moment), and beneath it "Earlier" lists the last seven days as one line each: a few covers, the date (Yesterday, a weekday, then "Oct 9"), how many, whose faces. A line opens in place with its tracks, a Play all and a link to the day's own page (`/days/2026-10-15`), which is the playlist that day. "All days" (`/days`) is the full index by month, with one line at the top saying what it is. Days are decided in the viewer's time zone (the client sends it), so an evening in San Francisco stays on its own day. `src/lib/days.ts` holds the grouping; `/api/playlist?crew&tz` returns today plus the day index, `/api/playlist/day?crew&date&tz` one day.

## Crews

The crew switcher is top left. Each crew has a page (the switcher's first item, or `/crew`) with its people and what they are playing, the invite link, the playlist name, the viewer's own "lands here on its own" rule, public radio, and leaving. Settings is about you only: name, photo, appearance, DJ mode, where you listen, iMessage.

**Public radio.** Switch it on and the crew gets a read-only station page at `/radio/<code>` that anyone with the link can open with no account: the playlist with previews and who is playing what right now. Switch it off and the link stops working.

## The agent

Two small things, no more for now: the one-line note on a send and the playlist name. With `ANTHROPIC_API_KEY` set (or pasted on `/setup` as "The agent's voice") these come from Claude; without it, each falls back to a templated voice so nothing in the product waits on the API.

## Live

Live is what the crew is playing right now. On wide screens the same thing lives in the friends rail on the right of every page (the two-people icon in the top bar hides it). Each person is a record: the album art is the label, it spins while they play, rings pulse at the song's tempo, and a thin arc counts the song down. Tap one for a preview, the platform links, and a one-tap send to the crew. Five things feed it: the Mac helper and the Chrome extension (reports every few seconds), Spotify's currently-playing endpoint and Last.fm's now-playing flag (asked every fifteen seconds while someone has Live open, so nothing polls in the background; both work from a phone), and the Crate player itself (a heartbeat while a preview plays). The empty Live page says which of these a phone can use. When someone else is playing, the Playlist page carries a one-line band pointing at Live.

## Pocket mode

The icon left of the sun/moon (or Settings → Pocket mode) swaps the whole app for a small handheld: an amber screen, a knurled wheel you spin to scroll, a center key to select, and back / previous / play / next underneath. Playlist, Live, Log and Settings all work from it, previews play, and the arrow keys, Enter, Backspace and space do the same on a keyboard. Escape, the back key at the top menu, or "Back to Crate" leaves it.

## Crate in Chrome

Most listening that is not Spotify happens in a browser tab, and no site tells other apps about it. The `crate-chrome/` folder is a small Chrome extension (Manifest V3) that does: content scripts on SoundCloud, YouTube and YouTube Music read the page's own player (title, artist, link, position, whether it is playing), and on TIDAL, Deezer, Amazon Music, Pandora, Apple Music and Spotify on the web they read the page's Media Session metadata (what the OS media keys see). The background worker posts the playing tab to `/api/ingest/now` every few seconds as JSON. Pairing is the `/chrome` page itself: with the extension loaded, its content script finds the signed-in person's key on that page and takes it, and the page says Connected. Until it is published on the Chrome Web Store (one-click install), it loads unpacked from `chrome://extensions`, which is why it needs Chrome on a computer; phones take no extensions, and the page says so. `/api/ingest/now` answers CORS preflights, so the extension needs no host permissions beyond the music sites it reads.

## Crate on your Mac

Apple Music has no now-playing API and SoundCloud has neither now-playing nor play history, so on their own they can never reach Live. On a Mac they can. Settings → Where you listen → Crate on your Mac (the first fold, open by default on a computer until something is connected; `/settings#mac` opens it from anywhere) has a **Download the setup** button: it saves a Terminal settings file (`/api/mac/terminal`) that, opened, runs one line in Terminal; the same line is there to paste by hand:

```bash
curl -fsSL "http://localhost:3000/api/mac/install?key=crate_..." | bash
```

The server answers with a bash installer (`src/lib/mac.ts`) that writes a tiny loop and a launchd agent under the person's home folder, nothing else: every 4 seconds the loop runs one small AppleScript per installed and running player (`helpers/nowplaying/now-*.applescript`: the Music app, the Spotify app, the SoundCloud desktop app; browsers are the extension's job) and `curl` posts the raw answer to `/api/ingest/now` with their token. No node, no project folder, only what ships with macOS. An app that refuses (macOS has not allowed control yet) shows up under the bell with the exact Privacy setting to flip, and Settings shows what the Mac last reported. Live follows it at once; after thirty seconds of the same song it is logged as a play, which the crew rules turn into a playlist row. A play that a platform's own history reports as well within twenty minutes is kept once. The first time something plays, macOS asks whether it may control Music, Spotify and the browser. `&remove=1` on the same URL serves the uninstaller; the log is `~/Library/Logs/crate-nowplaying.log`.

## iMessage on your Mac

Messages has no API on iOS, but on a Mac its database is readable. `helpers/imessage/watch.mjs` polls it every 15 seconds for incoming music links and posts them to `/api/ingest` with your personal token (Settings → iMessage on your Mac → Show install command):

```bash
npm run imessage:install -- --url=http://localhost:3000 --token=crate_...
# optional: --handles=+14155550100,ariel@icloud.com to watch only some senders
npm run imessage:install -- --uninstall
```

It installs a launchd agent (runs at login, log in `~/Library/Logs/crate-imessage.log`). The first time, give Full Disk Access to the `node` binary it prints (System Settings → Privacy & Security → Full Disk Access). A link from a crew member who set their iMessage handle in Settings arrives as their send, with their text as the note; anything else lands at the top of your playlist as "received" and in your log.

## Why Spotify is a connector, not a dependency

Spotify removed audio features, recommendations and preview URLs for new apps in November 2024 and, in February 2026, limited Development Mode to five users with Extended access gated at 250,000 monthly actives. Nothing user-facing here depends on it: Spotify links resolve from page metadata and open directly, previews come from Apple's catalog, and the Spotify connector (likes and plays) works for a crew of up to five.

## Sending from a phone

- **Android:** install the PWA; Crate appears in the system share sheet (`share_target` in the manifest → `/send`).
- **iOS:** web apps cannot register for the share sheet, so Settings explains a one-minute Shortcut ("Send to Crate") that opens `/send?url=…` in the installed app. There is also a Paste button and, on desktop, paste-anywhere, drag-and-drop and ⌘K.

## Tests

```bash
npm test                 # unit: link parsing, title cleanup, DSP on synthetic signals
npm run build && npm run e2e
```

The end-to-end run boots a production server on a fresh SQLite file and drives two browsers (a desktop and an iPhone) through: start a crew, join by invite, send YouTube / Spotify / Apple Music / SoundCloud links with real resolution, keep and skip with keyboard and swipe, reply, Log, played-out, share target, catalog search, undo, in-browser audio analysis, the auth boundaries, pasting a Spotify key in Settings and the connect redirects, the crew rule (plays and likes streaming into the playlist), iMessage ingest from unknown and known numbers, the wrong-version fixer, and removals with confirmation. Screenshots land in `tests/e2e/out/`.

`node scripts/bpm-bench.mjs` (needs a system `ffmpeg`) scores the tempo estimator against 20 real previews.

## Layout of the code

```
src/app/                 routes (App Router). page.tsx = the playlist (PlaylistView, with the Reel stage), /live, /log, /days, /playlists/[id], /settings, /connect, /chrome, /setup, /join/[code], /send
src/app/api/             resolve, search, sends, sends/[id], sends/[id]/react, crate, log, tracks/[id]/analysis, preview proxy,
                         me, crews, crews/[id], join, sources, sync, cron/sync, ingest, ingest/token, live, connect/{spotify,youtube,soundcloud,apple}
src/components/          Shell (providers, paste/drop/⌘K, source sync), TopBar, Backdrop, Reel, StageCard (gestures), TrackCard,
                         SendFlow, LiveView, Pocket, LogView, SettingsView, SetupView, Connections, ConnectView, ThemeToggle, TabBar, Welcome, Sheet, Player (one <audio>)
src/lib/resolve/         parse.ts (pure), links.ts (pure), itunes.ts, deezer.ts, color.ts, index.ts (orchestrator)
src/lib/sources/         one provider per source + oauth.ts; sync.ts runs them and applies the auto-share rule
src/lib/audio/           dsp.ts (pure, tested), analyze.ts (browser glue)
src/lib/                 db.ts (libsql + schema), auth.ts (signed cookie), queries.ts, log.ts, live.ts, ingest.ts, crypto.ts, agent.ts, types.ts
helpers/imessage/        watch.mjs (the Mac helper), install.mjs (launchd)
public/                  manifest.webmanifest (share target), sw.js, icons
```

## Toward the App Store

The web app is the product; the native step is a thin wrapper. Capacitor (or a WKWebView shell) around this same URL gives the iOS share extension, push through APNs, and a listing. Nothing in the data model or UI changes. Until then, "Add to Home Screen" gives a full-screen, installed app with web push on iOS 16.4+.
