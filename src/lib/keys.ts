import { all, run, now } from "./db";
import { encrypt, decrypt } from "./crypto";

/**
 * Connector keys. Settings lets a person paste them in the app, where they are stored
 * encrypted; environment variables work too and act as defaults. A value saved in the app
 * wins over the environment so a change takes effect without a restart.
 */
export const KEY_NAMES = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_REDIRECT_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
  "SOUNDCLOUD_CLIENT_ID",
  "SOUNDCLOUD_CLIENT_SECRET",
  "TIDAL_CLIENT_ID",
  "TIDAL_CLIENT_SECRET",
  "LASTFM_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

export type KeyName = (typeof KEY_NAMES)[number];
export type Keys = Record<KeyName, string>;

let cache: { at: number; keys: Keys } | null = null;
const TTL = 10_000;

export async function getKeys(): Promise<Keys> {
  if (cache && now() - cache.at < TTL) return cache.keys;
  const keys = {} as Keys;
  for (const n of KEY_NAMES) keys[n] = (process.env[n] ?? "").trim();
  try {
    const rows = await all<{ key: string; value_enc: string }>("SELECT key, value_enc FROM app_settings");
    for (const r of rows) {
      if ((KEY_NAMES as readonly string[]).includes(r.key)) {
        try {
          const v = decrypt(r.value_enc).trim();
          if (v) keys[r.key as KeyName] = v;
        } catch {
          /* unreadable (secret changed); fall back to env */
        }
      }
    }
  } catch {
    /* table missing on a very old db; env only */
  }
  cache = { at: now(), keys };
  return keys;
}

export async function setKeys(values: Partial<Record<KeyName, string | null>>): Promise<void> {
  for (const [k, v] of Object.entries(values)) {
    if (!(KEY_NAMES as readonly string[]).includes(k)) continue;
    const val = (v ?? "").trim();
    if (!val) await run("DELETE FROM app_settings WHERE key = ?", [k]);
    else
      await run(
        "INSERT INTO app_settings (key, value_enc, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_enc = excluded.value_enc, updated_at = excluded.updated_at",
        [k, encrypt(val), now()],
      );
  }
  cache = null;
}

/** Which keys have a value (never the values themselves). */
export async function keyPresence(): Promise<Record<KeyName, boolean>> {
  const k = await getKeys();
  const out = {} as Record<KeyName, boolean>;
  for (const n of KEY_NAMES) out[n] = !!k[n];
  return out;
}
