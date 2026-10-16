#!/usr/bin/env node
/**
 * Installs (or removes) the Crate iMessage helper as a launchd agent so it runs whenever
 * you are logged in.
 *
 *   node helpers/imessage/install.mjs --token=crate_... [--url=http://localhost:3000] [--handles=+1415...]
 *   node helpers/imessage/install.mjs --uninstall
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((a) => (a.startsWith("--") ? a.slice(2).split("=") : [a, true])).map(([k, v]) => [k, v ?? true]));
const LABEL = "com.crate.imessage";
const plistPath = join(homedir(), "Library/LaunchAgents", `${LABEL}.plist`);
const uid = process.getuid();

function launchctl(...a) {
  try {
    execFileSync("launchctl", a, { stdio: "ignore" });
  } catch {
    /* not loaded */
  }
}

if (args.uninstall) {
  launchctl("bootout", `gui/${uid}`, plistPath);
  if (existsSync(plistPath)) unlinkSync(plistPath);
  console.log("Removed the Crate iMessage helper.");
  process.exit(0);
}

const token = args.token || process.env.CRATE_TOKEN;
if (!token) {
  console.error("Pass --token=crate_... (from Settings → iMessage on your Mac).");
  process.exit(1);
}
const url = args.url || process.env.CRATE_URL || "http://localhost:3000";
const node = process.execPath;
const script = resolve(dirname(fileURLToPath(import.meta.url)), "watch.mjs");
const log = join(homedir(), "Library/Logs/crate-imessage.log");
const env = { CRATE_URL: url, CRATE_TOKEN: token, PATH: process.env.PATH || "/usr/bin:/bin" };
if (args.handles) env.CRATE_HANDLES = String(args.handles);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${esc(node)}</string><string>${esc(script)}</string></array>
  <key>EnvironmentVariables</key><dict>${Object.entries(env)
    .map(([k, v]) => `<key>${k}</key><string>${esc(v)}</string>`)
    .join("")}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict></plist>
`;
mkdirSync(dirname(plistPath), { recursive: true });
launchctl("bootout", `gui/${uid}`, plistPath);
writeFileSync(plistPath, plist);
launchctl("bootstrap", `gui/${uid}`, plistPath);
console.log(`Installed. It watches Messages for music links and sends them to ${url}.`);
console.log(`Log: ${log}`);
console.log(`If nothing arrives, give Full Disk Access to: ${node}`);
console.log("(System Settings → Privacy & Security → Full Disk Access → + → press Cmd+Shift+G and paste that path.)");
