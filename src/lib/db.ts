import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { clusterDoubles } from "./dedupe";

/**
 * Database access. One libsql client per process, schema created on first use.
 * Local: a SQLite file (DATABASE_URL=file:./data/crate.db).
 * Production: Turso / libsql (DATABASE_URL=libsql://..., DATABASE_AUTH_TOKEN=...).
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_dj INTEGER NOT NULL DEFAULT 0,
  preferred_platform TEXT NOT NULL DEFAULT 'apple',
  lastfm_user TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crews (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crew_members (
  crew_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (crew_id, user_id)
);
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  album TEXT,
  artwork_url TEXT,
  preview_url TEXT,
  apple_id TEXT,
  genre TEXT,
  duration_ms INTEGER,
  year INTEGER,
  links_json TEXT NOT NULL DEFAULT '{}',
  accent TEXT,
  bpm REAL,
  key_name TEXT,
  camelot TEXT,
  energy REAL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sends (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  note TEXT,
  note_by TEXT NOT NULL DEFAULT 'human',
  source_url TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sends_crew_created ON sends (crew_id, created_at);
CREATE TABLE IF NOT EXISTS reactions (
  send_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reply TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (send_id, user_id)
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT,
  token_enc TEXT,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sources_user_kind ON sources (user_id, kind);
CREATE TABLE IF NOT EXISTS log_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  action TEXT NOT NULL,
  at INTEGER NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  status TEXT,
  reply TEXT,
  status_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS log_unique ON log_entries (user_id, source_kind, external_id, action);
CREATE INDEX IF NOT EXISTS log_user_at ON log_entries (user_id, at);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_enc TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS live_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  track_id TEXT,
  title TEXT,
  artist TEXT,
  artwork_url TEXT,
  url TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS live_history_user_started ON live_history (user_id, started_at);
CREATE TABLE IF NOT EXISTS echoes (
  send_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  via TEXT NOT NULL DEFAULT 'app',
  PRIMARY KEY (send_id, user_id)
);
CREATE TABLE IF NOT EXISTS notice_dismissals (
  user_id TEXT NOT NULL,
  notice_id TEXT NOT NULL,
  dismissed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, notice_id)
);
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS playlists_crew ON playlists (crew_id, created_at);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);
CREATE TABLE IF NOT EXISTS tune_ins (
  crew_id TEXT NOT NULL,
  viewer TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (crew_id, viewer)
);
CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  playing INTEGER NOT NULL DEFAULT 0,
  track_id TEXT,
  title TEXT,
  artist TEXT,
  artwork_url TEXT,
  url TEXT,
  progress_ms INTEGER,
  duration_ms INTEGER,
  started_at INTEGER,
  updated_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT 0
);
`;

/** Columns added after the first release; applied idempotently on startup. */
const COLUMNS: Array<[table: string, column: string, ddl: string]> = [
  ["crew_members", "share_likes", "INTEGER NOT NULL DEFAULT 0"],
  ["crew_members", "auto_share", "TEXT NOT NULL DEFAULT 'plays'"],
  ["crew_members", "share_since", "INTEGER"],
  ["users", "ingest_token", "TEXT"],
  ["users", "imessage_handle", "TEXT"],
  ["users", "mac_blocked", "TEXT"],
  ["users", "mac_last", "TEXT"],
  ["users", "mac_seen_at", "INTEGER"],
  ["sends", "via", "TEXT NOT NULL DEFAULT 'app'"],
  ["users", "avatar", "TEXT"],
  ["users", "avatar_v", "INTEGER NOT NULL DEFAULT 0"],
  ["crews", "playlist_name", "TEXT"],
  ["crews", "playlist_named_at", "INTEGER"],
  ["crews", "playlist_named_for", "INTEGER NOT NULL DEFAULT 0"],
  ["crews", "playlist_name_by", "TEXT"],
  ["crews", "public_code", "TEXT"],
  ["crews", "avatar", "TEXT"],
  ["crews", "avatar_v", "INTEGER NOT NULL DEFAULT 0"],
  ["playlists", "public_code", "TEXT"],
];

let client: Client | null = null;
let ready: Promise<void> | null = null;

function envEndingIn(suffix: string): string | undefined {
  for (const [k, v] of Object.entries(process.env)) if (k.endsWith(suffix) && v) return v;
  return undefined;
}

function makeClient(): Client {
  // Turso's Vercel integration names these <PREFIX>_TURSO_DATABASE_URL and <PREFIX>_TURSO_AUTH_TOKEN,
  // the prefix chosen at install time; any spelling that ends that way is taken.
  const url = process.env.DATABASE_URL || envEndingIn("TURSO_DATABASE_URL") || "file:./data/crate.db";
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      /* directory exists or is not creatable; libsql will report */
    }
  }
  return createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || envEndingIn("TURSO_AUTH_TOKEN") || undefined,
  });
}

export async function db(): Promise<Client> {
  if (!client) client = makeClient();
  if (!ready) {
    const c = client;
    ready = (async () => {
      const statements = SCHEMA.split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of statements) await c.execute(s);
      for (const [table, column, ddl] of COLUMNS) {
        const info = await c.execute(`PRAGMA table_info(${table})`);
        const has = info.rows.some((r) => String((r as unknown as { name: string }).name) === column);
        if (!has) await c.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
      }
      // Every playlist has a link of its own from the day it is made; ones from before get theirs now.
      const bare = await c.execute("SELECT id FROM playlists WHERE public_code IS NULL");
      for (const r of bare.rows) await c.execute({ sql: "UPDATE playlists SET public_code = ? WHERE id = ?", args: [inviteCode(), String((r as unknown as { id: string }).id)] });
      // One-time changes of mind, each recorded in app_settings so it runs once per install.
      const once = async (key: string, fn: () => Promise<void>) => {
        const done = await c.execute({ sql: "SELECT 1 AS x FROM app_settings WHERE key = ?", args: [key] });
        if (done.rows.length) return;
        await fn();
        await c.execute({ sql: "INSERT INTO app_settings (key, value_enc, updated_at) VALUES (?, '1', ?)", args: [key, Date.now()] });
      };
      // Crate starts from the day you connect: what a platform remembers from before stays there.
      await once("migr:fresh_start_v1", async () => {
        await c.execute(
          "DELETE FROM log_entries WHERE id IN (SELECT l.id FROM log_entries l JOIN sources s ON s.user_id = l.user_id AND s.kind = l.source_kind WHERE l.at < s.created_at + 120000)",
        );
      });
      // Plays stream into every crew's playlist from now on; each person can narrow it per crew.
      await once("migr:auto_share_v1", async () => {
        await c.execute({ sql: "UPDATE crew_members SET auto_share = 'plays', share_since = ?", args: [Date.now()] });
      });
    })();
  }
  await ready;
  // Doubles written by syncs that ran at once, before the writes were made atomic: folded in the
  // background, a few seconds at a time, never in a request's way. Each run makes progress; the
  // mark is set only when a run finds nothing left.
  scheduleDedupe(client);
  return client;
}

const DEDUPE_KEY = "migr:dedupe_doubles_v1";
let dedupeScheduled = false;

function scheduleDedupe(c: Client): void {
  if (dedupeScheduled) return;
  dedupeScheduled = true;
  (async () => {
    const done = await c.execute({ sql: "SELECT 1 AS x FROM app_settings WHERE key = ?", args: [DEDUPE_KEY] });
    if (done.rows.length) return;
    const finished = await dedupeDoubles(c, 3000);
    if (finished) await c.execute({ sql: "INSERT OR IGNORE INTO app_settings (key, value_enc, updated_at) VALUES (?, '1', ?)", args: [DEDUPE_KEY, Date.now()] });
  })().catch((e) => {
    console.error("dedupe:", (e as Error).message);
    dedupeScheduled = false; // another request may try again
  });
}

/** A send of the same track by the same person in the same crew this close to an earlier one is its double. */
const DOUBLE_WINDOW = 10 * 60 * 1000;

/**
 * Folds doubled sends (their reactions and echoes move to the one kept) and doubled Live history
 * rows, for up to budgetMs. True when it got through everything; false when it stopped early,
 * with the rest left for the next run.
 */
export async function dedupeDoubles(c: Client, budgetMs = Infinity): Promise<boolean> {
  const t0 = Date.now();
  const over = () => Date.now() - t0 > budgetMs;
  type SendRow = { id: string; crew_id: string; track_id: string; from_user_id: string; created_at: number };
  const sends = (await c.execute("SELECT id, crew_id, track_id, from_user_id, created_at FROM sends ORDER BY created_at")).rows as unknown as SendRow[];
  for (const { keep, dups } of clusterDoubles(sends, (s) => `${s.crew_id}|${s.track_id}|${s.from_user_id}`, (s) => Number(s.created_at), DOUBLE_WINDOW)) {
    for (const d of dups) {
      if (over()) return false;
      await c.execute({ sql: "INSERT OR IGNORE INTO reactions (send_id, user_id, status, reply, updated_at) SELECT ?, user_id, status, reply, updated_at FROM reactions WHERE send_id = ?", args: [keep.id, d.id] });
      await c.execute({ sql: "INSERT OR IGNORE INTO echoes (send_id, user_id, at, via) SELECT ?, user_id, at, via FROM echoes WHERE send_id = ?", args: [keep.id, d.id] });
      await c.execute({ sql: "DELETE FROM reactions WHERE send_id = ?", args: [d.id] });
      await c.execute({ sql: "DELETE FROM echoes WHERE send_id = ?", args: [d.id] });
      await c.execute({ sql: "DELETE FROM sends WHERE id = ?", args: [d.id] });
    }
  }
  type PlayRow = { id: string; user_id: string; title: string | null; artist: string | null; started_at: number; ended_at: number };
  const plays = (await c.execute("SELECT id, user_id, title, artist, started_at, ended_at FROM live_history ORDER BY started_at")).rows as unknown as PlayRow[];
  for (const { keep, dups } of clusterDoubles(plays, (p) => `${p.user_id}|${p.title}|${p.artist}`, (p) => Number(p.started_at), DOUBLE_WINDOW)) {
    if (over()) return false;
    const ended = Math.max(Number(keep.ended_at), ...dups.map((d) => Number(d.ended_at)));
    await c.execute({ sql: "UPDATE live_history SET ended_at = ? WHERE id = ?", args: [ended, keep.id] });
    for (const d of dups) await c.execute({ sql: "DELETE FROM live_history WHERE id = ?", args: [d.id] });
  }
  return true;
}

export type Row = Record<string, InValue>;

export async function one<T = Row>(sql: string, args: InValue[] = []): Promise<T | null> {
  const c = await db();
  const r = await c.execute({ sql, args });
  return (r.rows[0] as unknown as T) ?? null;
}

export async function all<T = Row>(sql: string, args: InValue[] = []): Promise<T[]> {
  const c = await db();
  const r = await c.execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function run(sql: string, args: InValue[] = []): Promise<number> {
  const c = await db();
  const r = await c.execute({ sql, args });
  return r.rowsAffected;
}

export function now(): number {
  return Date.now();
}

export function id(prefix = ""): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return prefix ? `${prefix}_${s}` : s;
}

export function inviteCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
