import type { Links } from "./resolve/links";

export type Track = {
  id: string;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  appleId: string | null;
  genre: string | null;
  durationMs: number | null;
  year: number | null;
  links: Links;
  accent: string | null;
  bpm: number | null;
  keyName: string | null;
  camelot: string | null;
  energy: number | null;
};

export type ReactionStatus = "seen" | "skipped" | "saved" | "played";

export type Person = { id: string; name: string; isDj: boolean; avatarUrl: string | null };

export type Send = {
  id: string;
  crewId: string;
  track: Track;
  from: Person;
  note: string | null;
  noteBy: "human" | "agent";
  sourceUrl: string | null;
  createdAt: number;
  reaction: { status: ReactionStatus; reply: string | null; updatedAt: number } | null;
  /** Earlier sends of the same track in this crew, newest first. */
  history: Array<{ sendId: string; fromName: string; createdAt: number }>;
  /** Where the send came from: "app", a source kind such as "spotify", "played:spotify", or "imessage". */
  via: string;
  /** Others in the crew who played or liked this track after it was here; the avatars on the row. */
  echoes: Array<{ person: Person; at: number; via: string }>;
  /** The last time anyone brought this track up: the send itself or its newest echo. */
  activeAt: number;
};

export type LogAction = "liked" | "played" | "received" | "sent" | "kept" | "playedOut";

export type LogItem = {
  id: string;
  action: LogAction;
  at: number;
  track: Track;
  /** Source kind for liked/played/received; "app" for the rest. */
  source: string;
  /** Who or where: a crew name, a contact, a platform label. */
  detail: string | null;
  /** The reel card id, when this item can be opened as one. */
  sendId: string | null;
};

export type AutoShare = "plays" | "likes" | "off";

export type Crew = {
  id: string;
  name: string;
  inviteCode: string;
  members: Person[];
  /** The viewer's rule for this crew: everything they play lands here, just their likes, or nothing. */
  autoShare: AutoShare;
  /** The crew's running playlist name (AI-named, or set by a member). */
  playlistName: string | null;
  /** Public radio: a read-only page anyone with the link can open. Null when off. */
  publicCode: string | null;
  /** The crew's own picture, when one was set. */
  avatarUrl: string | null;
};

export type SourceInfo = {
  kind: string;
  label: string | null;
  status: string;
  error: string | null;
  lastSyncAt: number | null;
};

export type Me = {
  id: string;
  name: string;
  isDj: boolean;
  avatarUrl: string | null;
  preferredPlatform: string;
  lastfmUser: string | null;
  imessageHandle: string | null;
  crews: Crew[];
  sources: SourceInfo[];
  /** Which connectors this deployment has keys for. */
  connectors: Record<string, boolean>;
  /** What needs this person's hand right now; the bell top right. */
  notices: Notice[];
};

export type Notice = {
  id: string;
  kind: "reconnect" | "error";
  title: string;
  body: string | null;
  action: { label: string; href: string } | null;
  at: number | null;
};

export type Playlist = {
  crewId: string;
  name: string;
  namedBy: "agent" | "template" | "human";
  count: number;
  unseen: number;
  members: Person[];
  sends: Send[];
  publicCode: string | null;
};
