// Benchmarks the tempo/key estimator on real 30-second previews (Deezer, MP3) decoded with ffmpeg.
// node scripts/bpm-bench.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { analyzePcm } from "../src/lib/audio/dsp.ts";

const FFMPEG = process.env.FFMPEG || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux";
const CASES = [
  ["daft punk around the world", 121],
  ["daft punk one more time", 123],
  ["rick astley never gonna give you up", 113],
  ["new order blue monday", 130],
  ["avicii levels", 126],
  ["michael jackson billie jean", 117],
  ["darude sandstorm", 136],
  ["daft punk get lucky", 116],
  ["deadmau5 strobe", 128],
  ["massive attack teardrop", 78],
  ["white stripes seven nation army", 124],
  ["burial archangel", 139],
  ["four tet baby", 125],
  ["bicep glue", 126],
  ["overmono so u kno", 134],
  ["fred again marea", 130],
  ["caribou odessa", 122],
  ["jamie xx gosh", 130],
  ["the chemical brothers galvanize", 102],
  ["radiohead everything in its right place", 124],
];

mkdirSync("data/bench", { recursive: true });

async function preview(q) {
  const j = await (await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`)).json();
  return j.data?.[0]?.preview ?? null;
}

function decode(mp3Path) {
  const raw = execFileSync(FFMPEG, ["-v", "quiet", "-i", mp3Path, "-f", "f32le", "-ac", "1", "-ar", "44100", "-"], { maxBuffer: 64 * 1024 * 1024 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

let ok = 0;
for (const [q, expected] of CASES) {
  const file = `data/bench/${q.replace(/\W+/g, "_")}.mp3`;
  if (!existsSync(file)) {
    const url = await preview(q);
    if (!url) {
      console.log(`${q.padEnd(44)} no preview`);
      continue;
    }
    writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  const pcm = decode(file);
  const a = analyzePcm(pcm, 44100);
  const ratio = a.bpm / expected;
  const hit = Math.abs(ratio - 1) < 0.04;
  const half = Math.abs(ratio - 0.5) < 0.03 || Math.abs(ratio - 2) < 0.06;
  if (hit) ok++;
  console.log(`${q.padEnd(44)} expected ${String(expected).padStart(3)}  got ${a.bpm.toFixed(1).padStart(6)}  ${hit ? "ok" : half ? "octave" : "MISS"}   key ${a.keyName} (${a.camelot}) conf ${a.keyConfidence.toFixed(2)}  energy ${a.energy}`);
}
console.log(`\n${ok}/${CASES.length} within 4%`);
void readFileSync;
