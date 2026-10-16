import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePcm, fftInPlace, estimateKey, chromaVector } from "../../src/lib/audio/dsp.ts";

const SR = 44100;

function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** A synthetic 20-second track: kick-ish clicks at a given BPM over a chord loop in a given key. */
function synth(bpm: number, chords: number[][], seconds = 20): Float32Array {
  const n = SR * seconds;
  const out = new Float32Array(n);
  const beat = (60 / bpm) * SR;
  // Clicks: short decaying noise bursts with a low sine thump on every beat.
  for (let b = 0; b * beat < n; b++) {
    const start = Math.round(b * beat);
    for (let i = 0; i < 2000 && start + i < n; i++) {
      const env = Math.exp(-i / 300);
      out[start + i] += env * (0.6 * Math.sin((2 * Math.PI * 55 * i) / SR) + 0.3 * (Math.random() * 2 - 1));
    }
  }
  // Chords: one chord per bar (4 beats), three partials each, quiet enough not to swamp the clicks.
  const bar = beat * 4;
  for (let i = 0; i < n; i++) {
    const chord = chords[Math.floor(i / bar) % chords.length];
    let s = 0;
    for (const m of chord) {
      const f = midiHz(m);
      s += Math.sin(2 * Math.PI * f * (i / SR)) + 0.4 * Math.sin(2 * Math.PI * 2 * f * (i / SR));
    }
    out[i] += 0.08 * s;
  }
  return out;
}

test("fft matches a known spectrum", () => {
  const n = 1024;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 32 * i) / n);
  fftInPlace(re, im);
  let peak = 0;
  for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[peak], im[peak])) peak = k;
  assert.equal(peak, 32);
});

test("tempo and key on a synthetic 128 BPM A-minor loop", () => {
  // Am, Dm, E, Am (E major adds the G# leading tone that separates A minor from C major)
  const A = 57;
  const chords = [
    [A, A + 3, A + 7],
    [A + 5, A + 8, A + 12],
    [A + 7, A + 11, A + 14],
    [A, A + 3, A + 7],
  ];
  const pcm = synth(128, chords);
  const a = analyzePcm(pcm, SR);
  assert.ok(Math.abs(a.bpm - 128) < 1.5, `bpm was ${a.bpm}`);
  assert.equal(a.keyName, "A minor", `key was ${a.keyName}`);
  assert.equal(a.camelot, "8A");
  assert.ok(a.energy >= 1 && a.energy <= 10);
});

test("tempo on a 174 BPM loop does not halve", () => {
  const pcm = synth(174, [[62, 65, 69]], 20);
  const a = analyzePcm(pcm, SR);
  assert.ok(Math.abs(a.bpm - 174) < 2 || Math.abs(a.bpm - 87) < 1, `bpm was ${a.bpm}`);
});

test("key estimation on a clean F major chroma", () => {
  // Build chroma directly from a sustained F major triad so key logic is tested apart from the FFT path.
  const n = SR * 4;
  const pcm = new Float32Array(n);
  for (const m of [53, 57, 60, 65, 69, 72]) {
    const f = midiHz(m);
    for (let i = 0; i < n; i++) pcm[i] += 0.1 * Math.sin(2 * Math.PI * f * (i / SR));
  }
  const k = estimateKey(chromaVector(pcm, SR));
  assert.equal(k.keyName, "F major");
  assert.equal(k.camelot, "7B");
});
