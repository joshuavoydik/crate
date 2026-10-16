#!/usr/bin/env node
/**
 * Crate iMessage helper (macOS). Watches the Messages database for incoming music links and
 * posts them to Crate, so a link a friend texts you lands in your Reel without a tap.
 *
 *   CRATE_URL=http://localhost:3000 CRATE_TOKEN=crate_... node helpers/imessage/watch.mjs
 *
 * Options: --once (one pass, then exit), --backfill=50 (also scan the last 50 messages on first run),
 *          --handles=+14155550100,ariel@example.com (only these senders; default: everyone)
 *
 * Needs Full Disk Access for the process that runs it (System Settings → Privacy & Security →
 * Full Disk Access → add Terminal, or the node binary when run by launchd). Uses the sqlite3
 * that ships with macOS, so there is nothing to install.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a) => (a.startsWith("--") ? a.slice(2).split("=") : [a, true])).map(([k, v]) => [k, v ?? true]));
const CRATE_URL = (process.env.CRATE_URL || args.url || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.CRATE_TOKEN || args.token;
const ONLY = String(process.env.CRATE_HANDLES || args.handles || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DB = join(homedir(), "Library/Messages/chat.db");
const STATE = join(homedir(), ".crate-imessage.json");
const INTERVAL = 15000;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const MUSIC = /(open\.spotify\.com|spotify\.link|music\.apple\.com|itunes\.apple\.com|youtu\.be|youtube\.com|soundcloud\.com|bandcamp\.com|beatport\.com|tidal\.com|deezer\.com|song\.link|album\.link)/i;

if (!TOKEN) {
  console.error("Set CRATE_TOKEN (Settings → iMessage on your Mac in Crate shows it).");
  process.exit(1);
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return { lastRowId: null };
  }
}
function saveState(s) {
  writeFileSync(STATE, JSON.stringify(s));
}

function query(sql) {
  const out = execFileSync("/usr/bin/sqlite3", ["-json", "-readonly", DB, sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.trim() ? JSON.parse(out) : [];
}

/** Messages store the body as an archived NSAttributedString; the plain text sits after "NSString". */
function textFromBody(hex) {
  if (!hex) return null;
  const buf = Buffer.from(hex, "hex");
  const marker = buf.indexOf("NSString");
  if (marker < 0) return null;
  let i = marker + "NSString".length + 5; // skip \x01\x94\x84\x01\x2b
  if (i >= buf.length) return null;
  let len = buf[i];
  if (len === 0x81) {
    len = buf.readUInt16LE(i + 1);
    i += 3;
  } else i += 1;
  const s = buf.subarray(i, i + len).toString("utf8");
  return s || null;
}

function appleDateToMs(d) {
  if (!d) return Date.now();
  const n = Number(d);
  return (n > 1e12 ? n / 1e6 : n * 1000) + 978307200000;
}

function normalize(h) {
  const s = String(h || "").trim();
  if (s.includes("@")) return s.toLowerCase();
  const digits = s.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (digits.length === 10) return `+1${digits}`;
  return digits ? `+${digits}` : s.toLowerCase();
}
const onlySet = new Set(ONLY.map(normalize));

async function post(payload) {
  const r = await fetch(`${CRATE_URL}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j.outcome;
}

async function pass(state) {
  if (state.lastRowId === null) {
    const [{ m }] = query("SELECT MAX(ROWID) AS m FROM message");
    const backfill = Number(args.backfill || 0);
    state.lastRowId = Math.max(0, Number(m || 0) - backfill);
    saveState(state);
    console.log(`[crate] starting at message ${state.lastRowId}${backfill ? ` (backfilling ${backfill})` : ""}`);
  }
  const rows = query(
    `SELECT m.ROWID AS rowid, m.text, hex(m.attributedBody) AS body, m.date, m.is_from_me, h.id AS handle, c.display_name AS chat_name
     FROM message m
     LEFT JOIN handle h ON h.ROWID = m.handle_id
     LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
     LEFT JOIN chat c ON c.ROWID = cmj.chat_id
     WHERE m.ROWID > ${Number(state.lastRowId)} ORDER BY m.ROWID ASC LIMIT 500`,
  );
  let maxRow = state.lastRowId;
  const seen = new Set();
  for (const r of rows) {
    maxRow = Math.max(maxRow, Number(r.rowid));
    if (seen.has(r.rowid)) continue; // a message in several chat joins
    seen.add(r.rowid);
    if (Number(r.is_from_me) === 1) continue;
    const text = r.text || textFromBody(r.body) || "";
    const urls = [...new Set((text.match(URL_RE) || []).filter((u) => MUSIC.test(u)))];
    if (!urls.length) continue;
    const handle = r.handle || "";
    if (onlySet.size && !onlySet.has(normalize(handle))) continue;
    for (const url of urls) {
      try {
        const outcome = await post({ url, text, from: handle, fromName: null, at: appleDateToMs(r.date) });
        console.log(`[crate] ${handle || "someone"} → ${url} → ${outcome?.kind ?? "ok"}`);
      } catch (e) {
        console.error(`[crate] failed to send ${url}: ${e.message}`);
        return; // leave the cursor so this message is retried next pass
      }
    }
  }
  state.lastRowId = maxRow;
  saveState(state);
}

async function main() {
  if (!existsSync(DB)) {
    console.error(`Messages database not found at ${DB}. Is this a Mac with Messages signed in?`);
    process.exit(1);
  }
  const state = loadState();
  for (;;) {
    try {
      await pass(state);
    } catch (e) {
      const msg = String(e.message || e);
      if (/unable to open|authorization denied|operation not permitted/i.test(msg)) {
        console.error("[crate] Cannot read Messages. Grant Full Disk Access to the app running this (Terminal, or node for launchd), then retry.");
      } else console.error(`[crate] ${msg}`);
    }
    if (args.once) break;
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main();
