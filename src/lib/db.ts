import { createClient, type Client, type InValue } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
];

let client: Client | null = null;
let ready: Promise<void> | null = null;

function makeClient(): Client {
  const url = process.env.DATABASE_URL || "file:./data/crate.db";
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
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
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
  return client;
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
