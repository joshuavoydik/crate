/**
 * The agent: one-line notes for sends and names for playlists.
 * Uses the Claude API when ANTHROPIC_API_KEY is set; otherwise a templated voice.
 * Nothing in the product depends on the API being available.
 */

export type NoteContext = {
  artist: string;
  title: string;
  album?: string | null;
  genre?: string | null;
  year?: number | null;
  bpm?: number | null;
  keyName?: string | null;
  senderName: string;
  recipientIsDj: boolean;
  sourcePlatform: string;
};

import { getKeys } from "./keys";

async function askClaude(prompt: string, maxTokens = 80): Promise<string | null> {
  const key = (await getKeys()).ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AGENT_MODEL || "claude-sonnet-4-5",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = j.content?.find((c) => c.type === "text")?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

function templatedNote(c: NoteContext): string {
  const bits: string[] = [];
  if (c.genre) bits.push(c.genre);
  if (c.year) bits.push(String(c.year));
  if (c.bpm) bits.push(`${Math.round(c.bpm)} BPM`);
  if (c.keyName) bits.push(c.keyName);
  const where =
    c.sourcePlatform === "soundcloud"
      ? "found on SoundCloud"
      : c.sourcePlatform === "bandcamp"
        ? "on Bandcamp, buyable"
        : c.sourcePlatform === "youtube"
          ? "pulled from YouTube"
          : "";
  if (bits.length && where) return `${bits.join(" · ")}, ${where}.`;
  if (bits.length) return `${bits.join(" · ")}.`;
  if (where) return `${where[0].toUpperCase()}${where.slice(1)}.`;
  return c.album ? `From ${c.album}.` : "Worth thirty seconds.";
}

export async function suggestNote(c: NoteContext): Promise<string> {
  const prompt = [
    "Write one short line (max 14 words) a music-obsessed friend would text when sending this track.",
    "No emoji, no hashtags, no quotes, no exclamation marks, no preamble. Specific, warm, slightly dry.",
    c.recipientIsDj ? "The recipient is a DJ; a mixing or set-placement angle is welcome when natural." : "",
    `Track: ${c.artist} - ${c.title}${c.album ? ` (${c.album})` : ""}${c.year ? `, ${c.year}` : ""}.`,
    c.genre ? `Genre: ${c.genre}.` : "",
    c.bpm ? `BPM: ${Math.round(c.bpm)}.` : "",
    c.keyName ? `Key: ${c.keyName}.` : "",
    `Found on ${c.sourcePlatform}.`,
    "Return only the line.",
  ]
    .filter(Boolean)
    .join("\n");
  const ai = await askClaude(prompt);
  if (ai) return ai.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 140);
  return templatedNote(c);
}

// ---------- playlist names ----------

export type PlaylistNameInput = {
  crewName: string;
  memberNames: string[];
  /** Newest first; a handful is enough. */
  tracks: Array<{ artist: string; title: string; genre?: string | null; year?: number | null; bpm?: number | null }>;
  count: number;
  /** The moment; now when left out. */
  when?: Date;
  /** The viewer's time zone (IANA), so "evening" is their evening and not the server's. */
  tz?: string;
};

const DAY_WORDS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayPart = "morning" | "afternoon" | "evening";

/** The hour, weekday and date of a moment as a clock in that zone shows them; the server's own zone when none is given or it is unknown. */
function clockIn(d: Date, tz?: string): { hour: number; weekday: number; ymd: string } {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
      const weekday = SHORT_DAYS.indexOf(get("weekday"));
      if (weekday >= 0) return { hour: Number(get("hour")) % 24, weekday, ymd: `${get("year")}-${get("month")}-${get("day")}` };
    } catch {
      /* not a zone Intl knows: the server's clock below */
    }
  }
  return { hour: d.getHours(), weekday: d.getDay(), ymd: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` };
}

/**
 * The moment a playlist is named after: the day and whether it is morning (5 to 12), afternoon
 * (12 to 17) or evening (17 on), on the viewer's clock. The small hours still belong to the
 * evening before, so a name does not flip to "Friday evening" at one in the morning.
 */
export function dayPart(d: Date, tz?: string): { day: string; part: DayPart; date: Date; ymd: string } {
  const h = clockIn(d, tz).hour;
  const date = h < 5 ? new Date(d.getTime() - 5 * 3600 * 1000) : d;
  const part: DayPart = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : "evening";
  const at = clockIn(date, tz);
  return { day: DAY_WORDS[at.weekday], part, date, ymd: at.ymd };
}

/** The part of the day a name belongs to; when this changes, the name is renewed. */
export function momentKey(d: Date, tz?: string): string {
  const { part, ymd } = dayPart(d, tz);
  return `${ymd}-${part}`;
}

/** "Thursday evening": the day and the part of the day, and nothing it cannot stand behind. */
export function templatedPlaylistName(i: PlaylistNameInput): string {
  const { day, part } = dayPart(i.when ?? new Date(), i.tz);
  return `${day} ${part}`;
}

/** The crew's running playlist name. Deliberately plain: the music speaks, the name tells the time. */
export async function suggestPlaylistName(i: PlaylistNameInput): Promise<{ name: string; by: "agent" | "template" }> {
  return { name: templatedPlaylistName(i), by: "template" };
}
