import { createClient } from "@libsql/client";
import { writeFileSync } from "node:fs";
import { json, error } from "@/lib/api";
import { db } from "@/lib/db";
import { signSession } from "@/lib/auth";
import { appUrl } from "@/lib/session";

export const maxDuration = 60;

/**
 * Moving a Crate: POST the old SQLite file (raw bytes) with "Authorization: Bearer $CRON_SECRET"
 * and every table is copied into this database, existing rows replaced by id. Answers with a
 * sign-in link per person (good for a day), since the old cookies belong to the old address.
 */
const TABLES = [
  "users",
  "crews",
  "crew_members",
  "tracks",
  "sends",
  "reactions",
  "sources",
  "log_entries",
  "app_settings",
  "live_history",
  "echoes",
  "notice_dismissals",
  "tune_ins",
  "presence",
];

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return error("CRON_SECRET is not set", 501);
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (given !== secret) return error("Forbidden", 403);
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length < 100 || bytes.subarray(0, 15).toString() !== "SQLite format 3") return error("Send the SQLite file itself");
  const path = `/tmp/crate-import-${Date.now()}.db`;
  writeFileSync(path, bytes);
  const old = createClient({ url: `file:${path}` });
  const live = await db();
  const counts: Record<string, number> = {};
  try {
    for (const t of TABLES) {
      let rows;
      try {
        rows = (await old.execute(`SELECT * FROM ${t}`)).rows;
      } catch {
        continue; // the old file predates this table
      }
      const liveCols = new Set((await live.execute(`PRAGMA table_info(${t})`)).rows.map((r) => String((r as unknown as { name: string }).name)));
      let n = 0;
      for (const r of rows) {
        const cols = Object.keys(r).filter((c) => liveCols.has(c));
        if (!cols.length) continue;
        await live.execute({
          sql: `INSERT OR REPLACE INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          args: cols.map((c) => (r as Record<string, unknown>)[c] as never),
        });
        n++;
      }
      counts[t] = n;
    }
  } finally {
    old.close();
  }
  const people = (await live.execute("SELECT id, name FROM users")).rows as unknown as Array<{ id: string; name: string }>;
  const links = [];
  for (const p of people) links.push({ id: p.id, name: p.name, signin: `${appUrl()}/api/admin/signin?token=${await signSession(p.id)}` });
  return json({ imported: counts, people: links });
}
