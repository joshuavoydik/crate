"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "./Store";
import { Sheet } from "./Sheet";
import { api, sourceName } from "@/lib/client";

/**
 * The maker's page. Spotify, Google, Apple, SoundCloud and TIDAL each require the app itself to be
 * registered once by its developer; after that, people using Crate just tap Connect and
 * approve with the account they are already signed in to. This page is that one-time step.
 */
type Field = { key: string; label: string; secret?: boolean; multiline?: boolean };
type Setup = { title: string; minutes: string; steps: string[]; fields: Field[]; redirect?: "spotify" | "youtube" | "soundcloud" | "tidal" };

const SETUP: Record<string, Setup> = {
  spotify: {
    title: "Spotify",
    minutes: "about 3 minutes",
    steps: [
      "Open developer.spotify.com/dashboard and sign in with your Spotify account.",
      "Create app: any name and description. Under Redirect URIs add exactly the address shown here, tick Web API, save.",
      "In the app's Settings → User Management, add the Spotify email of each person in your crew (Spotify allows 5 on a new app).",
      "Copy the Client ID into the field here.",
    ],
    fields: [{ key: "SPOTIFY_CLIENT_ID", label: "Client ID" }],
    redirect: "spotify",
  },
  youtube: {
    title: "YouTube",
    minutes: "about 5 minutes",
    steps: [
      "Open console.cloud.google.com and create a project (any name).",
      "APIs & Services → Library → enable YouTube Data API v3.",
      "APIs & Services → OAuth consent screen → External → add yourself and your crew as test users.",
      "Credentials → Create credentials → OAuth client ID → Web application → add the redirect URI shown here.",
      "Copy the Client ID and Client secret into the fields here.",
    ],
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "Client ID" },
      { key: "GOOGLE_CLIENT_SECRET", label: "Client secret", secret: true },
    ],
    redirect: "youtube",
  },
  apple: {
    title: "Apple Music",
    minutes: "optional: Music app plays come in through Crate on your Mac without it. About 3 minutes, needs an Apple Developer account",
    steps: [
      "developer.apple.com → Account → Certificates, Identifiers & Profiles → Keys → +.",
      "Name it, enable MusicKit, Continue, Register, then Download the .p8 file (Apple offers it once).",
      "Team ID is at the top right of the Account page; Key ID is on the key's page.",
      "Paste the .p8 file's contents below.",
    ],
    fields: [
      { key: "APPLE_TEAM_ID", label: "Team ID" },
      { key: "APPLE_KEY_ID", label: "Key ID" },
      { key: "APPLE_PRIVATE_KEY", label: "Private key (.p8 contents)", secret: true, multiline: true },
    ],
  },
  soundcloud: {
    title: "SoundCloud",
    minutes: "SoundCloud approves apps by hand; this one can take days",
    steps: [
      "Apply at soundcloud.com/you/apps.",
      "Once approved, set the redirect URI shown here in the app's settings.",
      "Paste the Client ID and Client secret here.",
    ],
    fields: [
      { key: "SOUNDCLOUD_CLIENT_ID", label: "Client ID" },
      { key: "SOUNDCLOUD_CLIENT_SECRET", label: "Client secret", secret: true },
    ],
    redirect: "soundcloud",
  },
  tidal: {
    title: "TIDAL",
    minutes: "about 3 minutes",
    steps: [
      "Open developer.tidal.com, sign in with your TIDAL account and create an app (any name).",
      "Add the redirect URI shown here. Keep the default scopes; Crate asks for collection.read and user.read.",
      "Copy the Client ID here (the secret too, if the dashboard gives you one).",
    ],
    fields: [
      { key: "TIDAL_CLIENT_ID", label: "Client ID" },
      { key: "TIDAL_CLIENT_SECRET", label: "Client secret (optional)", secret: true },
    ],
    redirect: "tidal",
  },
  lastfm: {
    title: "Last.fm",
    minutes: "about a minute",
    steps: ["Open last.fm/api/account/create (any application name).", "Copy the API key here."],
    fields: [{ key: "LASTFM_API_KEY", label: "API key", secret: true }],
  },
  agent: {
    title: "The agent's voice",
    minutes: "optional, about a minute",
    steps: ["Open console.anthropic.com → API keys → Create key.", "Paste it here. Notes and playlist names are then written by Claude instead of a template."],
    fields: [{ key: "ANTHROPIC_API_KEY", label: "Claude API key", secret: true }],
  },
};

const ORDER = ["spotify", "apple", "youtube", "soundcloud", "tidal", "lastfm", "agent"] as const;

export function SetupView() {
  const { me, refreshMe, toast, setAccentTrack } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<{ present: Record<string, boolean>; redirectUris: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAccentTrack(null);
    api<{ present: Record<string, boolean>; redirectUris: Record<string, string> }>("/api/keys")
      .then(setInfo)
      .catch(() => {});
  }, [setAccentTrack]);

  const isDone = (kind: string) => (kind === "agent" ? !!info?.present.ANTHROPIC_API_KEY : !!me.connectors[kind]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast(text);
    }
  }

  async function save(kind: string) {
    const spec = SETUP[kind];
    const body: Record<string, string> = {};
    for (const f of spec.fields) {
      const v = (values[f.key] ?? "").trim();
      if (v) body[f.key] = v;
    }
    if (!Object.keys(body).length) {
      toast("Paste the key first");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ present: Record<string, boolean>; connectors: Record<string, boolean> }>("/api/keys", { method: "POST", json: body });
      setInfo((k) => (k ? { ...k, present: r.present } : k));
      setValues({});
      setOpen(null);
      await refreshMe();
      toast(`${spec.title} is set up. Everyone can connect it now.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear(kind: string) {
    const spec = SETUP[kind];
    const body: Record<string, null> = {};
    for (const f of spec.fields) body[f.key] = null;
    setBusy(true);
    try {
      const r = await api<{ present: Record<string, boolean> }>("/api/keys", { method: "POST", json: body });
      setInfo((k) => (k ? { ...k, present: r.present } : k));
      setOpen(null);
      await refreshMe();
      toast(`${spec.title} removed`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page settings">
      <div className="page__head" style={{ display: "block" }}>
        <div className="caps">For whoever runs this Crate</div>
        <h1 className="display page__title" style={{ marginTop: 6 }}>
          One-time setup
        </h1>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: 15.5, maxWidth: "56ch" }}>
          Each service wants the app registered once, by you. After that, everyone just taps Connect. Until then its row in Settings is greyed out with
          &ldquo;Not switched on in this Crate yet&rdquo;. The Mac helper and the Chrome extension need none of this.
        </p>
      </div>

      {ORDER.map((kind) => {
        const spec = SETUP[kind];
        const done = isDone(kind);
        return (
          <div key={kind} className="source">
            <div style={{ minWidth: 0 }}>
              <div className="source__name">{spec.title}</div>
              <div className={`source__sub${done ? " is-on" : ""}`} style={done ? { color: "color-mix(in srgb, var(--accent) 80%, var(--ink))" } : undefined}>
                {done ? "Set up" : spec.minutes}
              </div>
            </div>
            <button className={`btn btn--sm${done ? " btn--ghost" : ""}`} onClick={() => setOpen(kind)}>
              {done ? "Change" : "Set up"}
            </button>
          </div>
        );
      })}

      <p className="faint" style={{ fontSize: 13, marginTop: 18 }}>
        Keys are stored encrypted in this Crate&apos;s database. Environment variables work too, as defaults.{" "}
        <Link href="/settings" style={{ textDecoration: "underline" }}>
          Back to settings
        </Link>
      </p>

      <Sheet open={!!open} onClose={() => setOpen(null)} label="Set up">
        {open && SETUP[open] && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(open);
            }}
          >
            <div className="caps">{SETUP[open].minutes}</div>
            <h3 className="display" style={{ fontSize: 30, margin: "8px 0 10px" }}>
              {SETUP[open].title}
            </h3>
            <ol className="steps" style={{ marginTop: 0 }}>
              {SETUP[open].steps.map((st, i) => (
                <li key={i}>{st}</li>
              ))}
            </ol>
            {SETUP[open].redirect && info && (
              <>
                <span className="label caps">Redirect URI to register</span>
                <div className="code" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{info.redirectUris[SETUP[open].redirect!]}</span>
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => copy(info.redirectUris[SETUP[open].redirect!])}>
                    Copy
                  </button>
                </div>
                {open === "spotify" && (
                  <p className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
                    Spotify does not accept &quot;localhost&quot;, so the local address uses 127.0.0.1. Either address works in the browser.
                  </p>
                )}
              </>
            )}
            {SETUP[open].fields.map((f) => (
              <div key={f.key}>
                <span className="label caps">
                  {f.label}
                  {info?.present[f.key] ? <span className="faint"> · set, paste to replace</span> : null}
                </span>
                {f.multiline ? (
                  <textarea
                    className="textarea"
                    rows={5}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    aria-label={f.label}
                    spellCheck={false}
                  />
                ) : (
                  <input
                    className="field"
                    type={f.secret ? "password" : "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    aria-label={f.label}
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              </div>
            ))}
            <div className="send__actions">
              {isDone(open) && (
                <button type="button" className="btn btn--ghost" onClick={() => clear(open)} disabled={busy}>
                  Remove
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(null)}>
                Later
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
