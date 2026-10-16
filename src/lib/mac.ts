import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MacReport } from "./live";

/**
 * Crate on your Mac, without installing anything: one line pasted in Terminal (or one double-click
 * on a Terminal settings file) fetches an installer from this server that drops a tiny shell loop
 * (osascript + curl, both built into macOS) and a launchd agent into the person's home folder.
 * The loop asks each installed player what it is playing every few seconds and posts the raw
 * answer here; this file parses it.
 */

const LABEL = "com.crate.nowplaying";

export type MacParse = { now: MacReport | null; errors: Array<{ app: string; message: string }> };

/** The scripts' tab-separated lines: the first thing playing, plus any app that refused to answer. */
export function parseNowLines(text: string): MacParse {
  let now: MacReport | null = null;
  const errors: MacParse["errors"] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [source, title, artist, album, duration, position, url] = line.split("\t");
    if (!source) continue;
    if (source === "err") {
      if (title) errors.push({ app: title.trim(), message: (artist ?? "").trim() });
      continue;
    }
    if (now || !title) continue;
    if (source === "soundcloud") {
      if (artist?.trim()) {
        // Read from the player bar itself: exact fields, times as "m:ss".
        now = { source, title: title.trim(), artist: artist.trim(), album: null, durationMs: clockMs(duration), positionMs: clockMs(position), url: url?.trim() || null };
        continue;
      }
      // From the tab title: "▶ Title by Artist | ..." at best.
      const t = title
        .replace(/^▶\s*/, "")
        .replace(/\s*\|[^|]*$/, "")
        .replace(/^Stream\s+/i, "")
        .trim();
      const m = t.match(/^(.*)\s+by\s+(.+)$/);
      if (!t) continue;
      now = { source, title: m ? m[1].trim() : t, artist: m ? m[2].trim() : "", album: null, durationMs: null, positionMs: null, url: url?.trim() || null };
      continue;
    }
    if (!["apple", "spotify", "youtube", "tidal", "deezer", "amazon", "pandora", "web"].includes(source)) continue;
    const d = Number(duration);
    const p = Number(position);
    now = {
      source,
      title: title.trim(),
      artist: (artist ?? "").trim(),
      album: album?.trim() || null,
      durationMs: Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null,
      positionMs: Number.isFinite(p) && p >= 0 ? Math.round(p * 1000) : null,
      url: url?.trim() || null,
    };
  }
  return { now, errors };
}

/** "1:23" or "1:02:03" to milliseconds; null for anything else. */
export function clockMs(s: string | undefined): number | null {
  if (!s || !/^\d+(:\d{1,2}){1,2}$/.test(s.trim())) return null;
  const parts = s.trim().split(":").map(Number);
  const secs = parts.reduce((acc, n) => acc * 60 + n, 0);
  return secs * 1000;
}

/** The one error a person can fix with a switch: macOS not yet allowing the helper to talk to an app. */
export function permissionProblem(errors: MacParse["errors"]): string | null {
  const e = errors.find((x) => /not authorized|not permitted|assistive access|1743|-25211/i.test(x.message));
  return e ? e.app : null;
}

const SCRIPTS: Array<{ file: string; app: string }> = [
  { file: "now-music.applescript", app: "Music" },
  { file: "now-spotify.applescript", app: "Spotify" },
  { file: "now-soundcloud.applescript", app: "SoundCloud" },
];

function scriptSources(): Array<{ file: string; app: string; text: string }> {
  const dir = join(process.cwd(), "helpers/nowplaying");
  const present = new Set(readdirSync(dir));
  return SCRIPTS.filter((s) => present.has(s.file)).map((s) => ({ ...s, text: readFileSync(join(dir, s.file), "utf8") }));
}

/** The loop. It asks only apps that exist on this Mac and are running, so nothing ever launches. */
function runner(url: string, token: string, scripts: Array<{ file: string; app: string }>): string {
  const asks = scripts
    .map(
      (s) => `  if has "${s.app}" && running "${s.app}"; then out+="$(/usr/bin/osascript "$DIR/${s.file}" 2>/dev/null)"$'\\n'; fi`,
    )
    .join("\n");
  return `#!/bin/bash
# Crate on your Mac: tells Crate what this computer is playing, every few seconds.
URL="${url}"
TOKEN="${token}"
DIR="$HOME/Library/Application Support/Crate"
has() { [ -e "/Applications/$1.app" ] || [ -e "/System/Applications/$1.app" ] || [ -e "$HOME/Applications/$1.app" ]; }
running() { /usr/bin/pgrep -xq "$1"; }
while true; do
  out=""
${asks}
  printf '%s' "$out" | /usr/bin/curl -s -m 8 -o /dev/null -X POST \\
    -H "authorization: Bearer $TOKEN" -H "content-type: text/plain; charset=utf-8" \\
    --data-binary @- "$URL/api/ingest/now"
  sleep 4
done
`;
}

/** The bash installer: pasted as `curl ... | bash`. Everything it writes lives under the person's home. */
export function installScript(opts: { url: string; token: string }): string {
  const url = opts.url.replace(/\/$/, "");
  const scripts = scriptSources();
  const files = scripts.map((s) => `cat > "$DIR/${s.file}" <<'CRATE_EOF'\n${s.text}\nCRATE_EOF`).join("\n\n");
  return `#!/bin/bash
set -e
DIR="$HOME/Library/Application Support/Crate"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG="$HOME/Library/Logs/crate-nowplaying.log"
mkdir -p "$DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

${files}

cat > "$DIR/nowplaying.sh" <<'CRATE_EOF'
${runner(url, opts.token, scripts)}
CRATE_EOF
chmod +x "$DIR/nowplaying.sh"

cat > "$PLIST" <<CRATE_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/nowplaying.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
CRATE_EOF

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Crate on your Mac is running. Play something in the Music or Spotify app."
echo "The first time, macOS asks whether it may control those apps: click OK."
`;
}

export function uninstallScript(): string {
  return `#!/bin/bash
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST" "$HOME/Library/Application Support/Crate/nowplaying.sh" "$HOME/Library/Application Support/Crate/"now-*.applescript
echo "Crate on your Mac is removed."
`;
}

/**
 * A Terminal settings file: double-click it and Terminal opens and runs the install line itself.
 * The one dialog left is macOS asking whether to open a file downloaded from the internet.
 */
export function terminalFile(opts: { url: string; token: string; remove?: boolean }): string {
  const url = opts.url.replace(/\/$/, "");
  const line = `curl -fsSL "${url}/api/mac/install?key=${opts.token}${opts.remove ? "&remove=1" : ""}" | bash`;
  const cmd = `/bin/bash -c '${line.replace(/'/g, `'\\''`)}; echo; echo "You can close this window."'`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CommandString</key>
  <string>${esc(cmd)}</string>
  <key>RunCommandAsShell</key>
  <true/>
  <key>name</key>
  <string>Crate</string>
  <key>type</key>
  <string>Window Settings</string>
  <key>ProfileCurrentVersion</key>
  <real>2.07</real>
  <key>columnCount</key>
  <integer>90</integer>
  <key>rowCount</key>
  <integer>18</integer>
</dict>
</plist>
`;
}
