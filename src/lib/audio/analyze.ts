"use client";

import { analyzePcm, toMono, type Analysis } from "./dsp";
import type { Track } from "../types";

const inflight = new Map<string, Promise<Track | null>>();

/**
 * Analyzes a track's 30-second preview in the browser (tempo, key, energy) and saves the
 * result to the track. Deduplicated per track id; resolves to the updated track or null.
 */
export function analyzeTrack(track: Track): Promise<Track | null> {
  if (!track.previewUrl) return Promise.resolve(null);
  if (track.bpm && track.keyName) return Promise.resolve(track);
  const existing = inflight.get(track.id);
  if (existing) return existing;
  const p = run(track).finally(() => inflight.delete(track.id));
  inflight.set(track.id, p);
  return p;
}

async function run(track: Track): Promise<Track | null> {
  try {
    const AC: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AC) return null;
    const r = await fetch(`/api/preview?u=${encodeURIComponent(track.previewUrl!)}`);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const ctx = new AC();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(buf.slice(0));
    } finally {
      ctx.close().catch(() => {});
    }
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    const pcm = toMono(channels);
    const a: Analysis = analyzePcm(pcm, decoded.sampleRate);
    if (!a.bpm || a.bpm < 40) return null;
    const res = await fetch(`/api/tracks/${encodeURIComponent(track.id)}/analysis`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bpm: a.bpm, keyName: a.keyName, camelot: a.camelot, energy: a.energy }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { track: Track };
    return j.track;
  } catch {
    return null;
  }
}
