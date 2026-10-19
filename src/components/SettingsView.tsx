"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "./Store";
import { Confirm } from "./Confirm";
import { Connections } from "./Connections";
import { ThemePicker } from "./ThemeToggle";
import { Avatar, squareDataUrl } from "./Avatar";
import { api, sourceName, timeAgo } from "@/lib/client";
import { PLATFORM_LABELS, orderPlatforms } from "@/lib/resolve/links";
import type { Me } from "@/lib/types";

export function SettingsView({ appUrl }: { appUrl: string }) {
  const { me, refreshMe, toast, setAccentTrack, setPocket } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.imessageHandle ?? "");
  const [saving, setSaving] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; run: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    setAccentTrack(null);
    setIsIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
  }, [setAccentTrack]);

  // Landing back from a Connect flow.
  useEffect(() => {
    const kind = params.get("connect");
    if (!kind) return;
    const err = params.get("error");
    if (err) toast(`${sourceName(kind)} did not connect: ${err}`);
    else {
      toast(`${sourceName(kind)} connected. Pulling your recent likes and plays.`);
      api("/api/sync", { method: "POST", json: { force: true } }).finally(() => refreshMe());
    }
    router.replace("/settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(body: Partial<{ name: string; isDj: boolean; preferredPlatform: string; imessageHandle: string | null }>) {
    setSaving(true);
    try {
      await api<{ me: Me }>("/api/me", { method: "PATCH", json: body });
      await refreshMe();
      toast("Saved");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast(text);
    }
  }

  async function signOut() {
    await api("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function showToken(rotate = false) {
    const r = await api<{ token: string; projectDir?: string }>("/api/ingest/token", { method: rotate ? "POST" : "GET" });
    setToken(r.token);
    if (r.projectDir) setProjectDir(r.projectDir);
  }

  const base = appUrl.replace(/\/$/, "");
  const installCmd = `cd "${projectDir ?? "<your Crate checkout>"}" && npm run imessage:install -- --url=${base} --token=${token ?? "<token>"}`;
  const macCmd = `curl -fsSL "${base}/api/mac/install?key=${token ?? "<token>"}" | bash`;
  const macRemoveCmd = `curl -fsSL "${base}/api/mac/install?key=${token ?? "<token>"}&remove=1" | bash`;

  return (
    <div className="page settings">
      <div className="page__head">
        <h1 className="display page__title">You</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== me.name) patch({ name: name.trim() });
        }}
      >
        <span className="label caps">Your name</span>
        <div className="send__row">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
          <button className="btn btn--sm" type="submit" disabled={saving || !name.trim() || name.trim() === me.name}>
            Save
          </button>
        </div>
      </form>

      <div className="switch" style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar name={me.name} url={me.avatarUrl} size={52} />
          <div>
            <div>Your photo</div>
            <div className="faint" style={{ fontSize: 13 }}>
              Top right, and next to what you send.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <label className="btn btn--sm" style={{ cursor: "pointer" }}>
            {me.avatarUrl ? "Change" : "Add"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              aria-label="Choose a photo"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const dataUrl = await squareDataUrl(f, 256);
                  await api("/api/me/avatar", { method: "POST", json: { dataUrl } });
                  await refreshMe();
                  toast("Looking good");
                } catch (x) {
                  toast((x as Error).message);
                }
              }}
            />
          </label>
          {me.avatarUrl && (
            <button
              className="btn btn--sm btn--ghost"
              onClick={async () => {
                await api("/api/me/avatar", { method: "POST", json: { dataUrl: null } });
                await refreshMe();
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="switch">
        <div>
          <div>Appearance</div>
          <div className="faint" style={{ fontSize: 13 }}>
            Auto follows your device.
          </div>
        </div>
        <ThemePicker />
      </div>

      <div className="switch">
        <div>
          <div>Pocket mode</div>
          <div className="faint" style={{ fontSize: 13 }}>
            The whole app on a little handheld with a scroll wheel. Esc or the back key brings you back.
          </div>
        </div>
        <button className="btn btn--sm" onClick={() => setPocket(true)}>
          Open
        </button>
      </div>

      <div className="switch">
        <div>
          <div>I DJ</div>
          <div className="faint" style={{ fontSize: 13 }}>
            BPM, key and energy on cards, a Played out button, buy links first.
          </div>
        </div>
        <button
          className={`toggle${me.isDj ? " is-on" : ""}`}
          role="switch"
          aria-checked={me.isDj}
          aria-label="I DJ"
          onClick={() => patch({ isDj: !me.isDj })}
        />
      </div>

      <span className="label caps">Open tracks in</span>
      <div className="chips">
        {orderPlatforms(null)
          .filter((k) => k !== "youtubeMusic")
          .map((k) => (
            <button key={k} className={`chip${me.preferredPlatform === k ? " is-on" : ""}`} onClick={() => patch({ preferredPlatform: k })}>
              {PLATFORM_LABELS[k]}
            </button>
          ))}
      </div>

      <div className="section">
        <div className="caps" style={{ marginBottom: 6 }}>
          Where you listen
        </div>
        <Connections />
      </div>

      <details className="section fold">
        <summary className="fold__sum">
          <span className="caps">Crate in Chrome</span>
          <span className="faint fold__hint">SoundCloud, YouTube and the rest, as you play them</span>
        </summary>
        <p className="muted" style={{ fontSize: 14.5, marginTop: 0 }}>
          A small Chrome extension tells Crate what plays in this browser: SoundCloud, YouTube, YouTube Music, TIDAL, Deezer, Amazon Music, Pandora, and
          Apple Music or Spotify on the web. Live lights up as it plays, and each play lands in your Log and your crews&apos; playlists. Nothing to switch on.{" "}
          <Link href="/chrome" style={{ textDecoration: "underline" }}>
            The full walkthrough
          </Link>
          .
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0 4px" }}>
          <Link className="btn btn--sm btn--primary" href="/chrome">
            Set up Crate in Chrome
          </Link>
          <span className="faint" style={{ fontSize: 13 }}>
            {projectDir ? (
              <>
                Running from a checkout: load the <code>crate-chrome</code> folder inside {projectDir}, then open that page.
              </>
            ) : (
              "The download, the steps, and the page that pairs it."
            )}
          </span>
        </div>
      </details>

      <details className="section fold">
        <summary className="fold__sum">
          <span className="caps">Crate on your Mac</span>
          <span className="faint fold__hint">The Music, Spotify and SoundCloud apps on this computer, live</span>
        </summary>
        <MacStatus />
        <p className="muted" style={{ fontSize: 14.5, marginTop: 0 }}>
          Apple Music never tells other apps what you are playing. Your Mac knows, though: one download sets up a tiny helper that asks the Music, Spotify and
          SoundCloud apps what is on, and tells Crate. Live lights up at once, and each play lands in your Log and your crews&apos; playlists. It uses only
          what ships with macOS.
        </p>
        {token ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
              <a className="btn btn--sm btn--primary" href="/api/mac/terminal" download>
                Download the setup
              </a>
              <span className="faint" style={{ fontSize: 13 }}>Open the file it saves; Terminal does the rest.</span>
            </div>
            <ol className="steps">
              <li>macOS asks whether to open a file from the internet: Open. A Terminal window runs for ten seconds and says it is done.</li>
              <li>The first time something plays, macOS asks whether it may control Music or Spotify. Click OK.</li>
            </ol>
            <details style={{ marginTop: 10 }}>
              <summary className="faint" style={{ fontSize: 13, cursor: "pointer" }}>Rather paste a line in Terminal, or remove it later</summary>
              <div className="code" style={{ margin: "8px 0" }}>
                {macCmd}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn--sm" onClick={() => copy(macCmd, "Command")}>
                  Copy command
                </button>
                <button className="btn btn--sm btn--ghost" onClick={() => copy(macRemoveCmd, "Remove command")}>
                  Copy remove command
                </button>
                <a className="btn btn--sm btn--ghost" href="/api/mac/terminal?remove=1" download>
                  Download the remover
                </a>
              </div>
            </details>
          </>
        ) : (
          <div>
            <button className="btn btn--sm" onClick={() => showToken(false)}>
              Show install command
            </button>
          </div>
        )}
      </details>

      <details className="section fold">
        <summary className="fold__sum">
          <span className="caps">iMessage on your Mac</span>
          <span className="faint fold__hint">Texted links land in your playlist</span>
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            patch({ imessageHandle: handle.trim() || null });
          }}
        >
          <span className="label caps">Your iMessage handle</span>
          <div className="send__row">
            <input
              className="field"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="+1 415 555 0100 or you@icloud.com"
              aria-label="Your iMessage handle"
            />
            <button className="btn btn--sm" type="submit" disabled={saving || (handle.trim() || null) === (me.imessageHandle ?? null)}>
              Save
            </button>
          </div>
        </form>
        <span className="label caps">Install the helper</span>
        {token ? (
          <>
            <div className="code" style={{ margin: "8px 0" }}>
              {installCmd}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn--sm" onClick={() => copy(installCmd, "Command")}>
                Copy command
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => showToken(true)}>
                New token
              </button>
            </div>
            <ol className="steps" style={{ marginTop: 12 }}>
              {!projectDir && <li>This one needs the Crate source on your Mac: clone the repository, run npm install in it, and use that folder in the command.</li>}
              <li>Paste that in Terminal and press Return.</li>
              <li>
                The first time, macOS needs to allow reading Messages: System Settings → Privacy &amp; Security → Full Disk Access → add the node binary the
                command prints.
              </li>
              <li>That&apos;s it. It runs at login; the log is in ~/Library/Logs/crate-imessage.log.</li>
            </ol>
          </>
        ) : (
          <div>
            <button className="btn btn--sm" onClick={() => showToken(false)}>
              Show install command
            </button>
          </div>
        )}
      </details>

      <details className="section fold">
        <summary className="fold__sum">
          <span className="caps">Send from your phone&apos;s share sheet</span>
          <span className="faint fold__hint">{isIos ? "One-time Shortcut" : "Install Crate, then share"}</span>
        </summary>
        {isIos ? (
          <>
            <p className="muted" style={{ fontSize: 14.5 }}>
              iOS does not let web apps appear in the share sheet, so a one-time Shortcut does it. Takes a minute.
            </p>
            <ol className="steps">
              <li>Open the Shortcuts app, tap +, name it “Send to Crate”.</li>
              <li>Tap the ⓘ button, turn on “Show in Share Sheet”, and set it to receive URLs.</li>
              <li>Add the action “URL” and type:</li>
            </ol>
            <div className="code" style={{ margin: "8px 0" }}>
              {base}/send?url=<span style={{ color: "var(--accent)" }}>[Shortcut Input]</span>
            </div>
            <ol className="steps" start={4}>
              <li>Add the action “Open URLs”. Done: share any track from any app and pick “Send to Crate”.</li>
            </ol>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 14.5 }}>
            Install Crate from your browser&apos;s menu and it shows up in the Android share sheet. On desktop, paste a link anywhere or press ⌘K.
          </p>
        )}
      </details>

      <div className="section" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn--ghost" onClick={signOut}>
          Sign out on this device
        </button>
        <Link href="/setup" className="caps" style={{ color: "var(--ink-3)" }}>
          App setup (for the maker)
        </Link>
      </div>

      <Confirm
        open={!!confirm}
        title={confirm?.title ?? ""}
        body={confirm?.body}
        confirmLabel={confirm?.label}
        busy={confirmBusy}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          setConfirmBusy(true);
          try {
            await confirm.run();
          } finally {
            setConfirmBusy(false);
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}


/** One quiet line: when the Mac helper last spoke and what it saw. */
function MacStatus() {
  const [state, setState] = useState<{ seenAt: number | null; last: string | null; blocked: string | null } | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () =>
      api<{ seenAt: number | null; last: string | null; blocked: string | null }>("/api/mac/status")
        .then((r) => {
          if (!stop) setState(r);
        })
        .catch(() => undefined);
    load();
    const id = setInterval(load, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  if (!state || !state.seenAt) return null;
  const ago = Date.now() - state.seenAt;
  const alive = ago < 20000;
  const lines = (state.last ?? "").split("\n").filter(Boolean);
  const playing = lines.find((l) => !l.startsWith("err\t"));
  const what = playing ? playing.split("\t") : null;
  const label = what ? `${what[0] === "apple" ? "Apple Music" : what[0] === "spotify" ? "Spotify" : "SoundCloud"}: ${what[1]}${what[2] ? ` by ${what[2]}` : ""}` : "nothing playing";
  return (
    <p className="faint" style={{ fontSize: 13, margin: "0 0 10px" }}>
      <span className={`dot${alive ? "" : " is-off"}`} style={{ marginRight: 6 }} />
      {alive ? `Your Mac is reporting · ${label}` : `Last heard from your Mac ${timeAgo(state.seenAt)}`}
      {state.blocked ? ` · cannot see ${state.blocked} yet` : ""}
    </p>
  );
}
