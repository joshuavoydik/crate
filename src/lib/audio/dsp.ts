/**
 * Small, dependency-free audio analysis for 30-second previews:
 * tempo (autocorrelation of spectral flux with a tempo prior),
 * key (Krumhansl-Schmuckler profile correlation over a chroma vector),
 * and a 1 to 10 energy score. Runs in the browser on decoded PCM, or in Node for tests.
 */

export type Analysis = {
  bpm: number;
  bpmConfidence: number;
  keyName: string;
  camelot: string;
  keyConfidence: number;
  energy: number;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlr = Math.cos(ang);
    const wli = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nwr;
      }
    }
  }
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/**
 * Onset strength per frame: spectral flux over ~40 log-spaced bands with log compression
 * (the "LogFiltSpecFlux" family), which is far less noisy than per-bin flux.
 */
export function onsetEnvelope(samples: Float32Array, sampleRate: number, frameSize = 2048, hop = 512): { env: Float32Array; frameRate: number } {
  const win = hann(frameSize);
  const frames = Math.max(0, Math.floor((samples.length - frameSize) / hop) + 1);
  const env = new Float32Array(frames);
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);
  const bins = frameSize >> 1;
  const binHz = sampleRate / frameSize;

  // Band edges: log-spaced from 40 Hz to 11 kHz.
  const NB = 40;
  const lo = 40;
  const hi = Math.min(11000, sampleRate / 2 - binHz);
  const edges: number[] = [];
  for (let b = 0; b <= NB; b++) edges.push(lo * Math.pow(hi / lo, b / NB));
  const bandOfBin = new Int16Array(bins).fill(-1);
  for (let k = 1; k < bins; k++) {
    const f = k * binHz;
    if (f < lo || f > hi) continue;
    let b = Math.floor((Math.log(f / lo) / Math.log(hi / lo)) * NB);
    if (b >= NB) b = NB - 1;
    bandOfBin[k] = b;
  }

  let prev = new Float32Array(NB);
  let cur = new Float32Array(NB);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < frameSize; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    cur.fill(0);
    for (let k = 1; k < bins; k++) {
      const b = bandOfBin[k];
      if (b < 0) continue;
      cur[b] += re[k] * re[k] + im[k] * im[k];
    }
    let flux = 0;
    for (let b = 0; b < NB; b++) {
      const v = Math.log1p(20 * Math.sqrt(cur[b]));
      cur[b] = v;
      const d = v - prev[b];
      if (d > 0) flux += d;
    }
    env[f] = flux;
    const t = prev;
    prev = cur;
    cur = t;
  }
  // Remove slow drift so the autocorrelation sees rhythm, not loudness changes.
  const smoothed = new Float32Array(frames);
  const win2 = Math.max(1, Math.round(0.5 * (sampleRate / hop)));
  for (let i = 0; i < frames; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - win2); j <= Math.min(frames - 1, i + win2); j++) {
      s += env[j];
      c++;
    }
    smoothed[i] = Math.max(0, env[i] - s / c);
  }
  return { env: smoothed, frameRate: sampleRate / hop };
}

/**
 * Tempo: candidates from a harmonic-summed autocorrelation of the onset envelope, then each
 * candidate is checked against the onsets themselves (how much onset energy lands on its beat
 * grid at the best phase). A 3:2 or 4:3 confusion scores well on autocorrelation but puts a
 * third of its beats between onsets, so the grid check separates them.
 */
export function estimateBpm(env: Float32Array, frameRate: number): { bpm: number; confidence: number } {
  const n = env.length;
  const minBpm = 60;
  const maxBpm = 200;
  const minLag = Math.max(2, Math.floor((60 * frameRate) / maxBpm));
  const maxLag = Math.min(n - 2, Math.ceil((60 * frameRate) / minBpm));
  if (n < 8 || maxLag <= minLag) return { bpm: 0, confidence: 0 };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = env[i] - mean;

  const acLen = Math.min(n - 2, maxLag * 4 + 2);
  const ac = new Float32Array(acLen + 1);
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += x[i] * x[i];
  if (r0 <= 0) return { bpm: 0, confidence: 0 };
  for (let lag = 1; lag <= acLen; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    ac[lag] = (s / (n - lag)) * (n / r0);
  }

  const prior = (lag: number): number => {
    const z = Math.log2((60 * frameRate) / lag / 125) / 0.9;
    return Math.exp(-0.5 * z * z);
  };

  // Autocorrelation peaks at multiples of the beat period (sub-harmonics of the tempo); the
  // Fourier tempogram peaks at multiples of the tempo. A 3:2 or 4:3 confusion is strong in only
  // one of them, so the product of harmonic-summed autocorrelation and Fourier magnitude
  // keeps the true period and suppresses the rest.
  const WEIGHTS = [1, 0.75, 0.5, 0.35];
  const harmonicAc = (lag: number): number => {
    let s = 0;
    for (let k = 1; k <= WEIGHTS.length; k++) {
      const l = Math.round(k * lag);
      if (l > acLen) break;
      s += WEIGHTS[k - 1] * Math.max(0, ac[l]);
    }
    return s;
  };
  const fourier = (period: number): number => {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI) / period;
    for (let t = 0; t < n; t++) {
      const v = x[t];
      re += v * Math.cos(w * t);
      im -= v * Math.sin(w * t);
    }
    return Math.hypot(re, im) / n;
  };

  const hArr = new Float32Array(maxLag + 2);
  const fArr = new Float32Array(maxLag + 2);
  let hMax = 0;
  let fMax = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    hArr[lag] = harmonicAc(lag);
    // Tempo harmonics: the beat frequency plus half weight on its double (eighth notes).
    fArr[lag] = fourier(lag) + 0.5 * fourier(lag / 2);
    if (hArr[lag] > hMax) hMax = hArr[lag];
    if (fArr[lag] > fMax) fMax = fArr[lag];
  }
  const score = (lag: number): number => (lag < minLag || lag > maxLag ? -1 : (hArr[lag] / (hMax || 1)) * (fArr[lag] / (fMax || 1)) * prior(lag));

  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const sc = score(lag);
    if (sc > bestScore) {
      bestScore = sc;
      bestLag = lag;
    }
  }

  const refine = (lag: number): number => {
    if (lag <= 1 || lag >= acLen) return lag;
    const a = ac[lag - 1];
    const b = ac[lag];
    const c = ac[lag + 1];
    const d = a - 2 * b + c;
    return d !== 0 ? lag + (0.5 * (a - c)) / d : lag;
  };

  let bpm = (60 * frameRate) / refine(bestLag);
  // Octave sanity: prefer the dance-music range when the half/double lag is nearly as strong.
  const at = (l: number): number => (l >= 1 && l <= acLen ? ac[Math.round(l)] : -Infinity);
  const lag = refine(bestLag);
  if (bpm < 85 && at(lag / 2) > 0.6 * at(lag)) bpm *= 2;
  else if (bpm > 180 && at(lag * 2) > 0.85 * at(lag)) bpm /= 2;

  const confidence = Math.max(0, Math.min(1, ac[bestLag]));
  return { bpm: Math.round(bpm * 10) / 10, confidence };
}

export function chromaVector(samples: Float32Array, sampleRate: number, frameSize = 8192, hop = 4096): Float32Array {
  const win = hann(frameSize);
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);
  const mags = new Float32Array(frameSize >> 1);
  const chroma = new Float32Array(12);
  const frames = Math.max(0, Math.floor((samples.length - frameSize) / hop) + 1);
  const binHz = sampleRate / frameSize;
  const kMin = Math.max(2, Math.ceil(55 / binHz));
  const kMax = Math.min((frameSize >> 1) - 2, Math.floor(4200 / binHz));
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < frameSize; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    let maxMag = 0;
    for (let k = kMin - 1; k <= kMax + 1; k++) {
      mags[k] = Math.hypot(re[k], im[k]);
      if (mags[k] > maxMag) maxMag = mags[k];
    }
    const floor = maxMag * 0.02;
    for (let k = kMin; k <= kMax; k++) {
      const m = mags[k];
      if (m < floor || m <= mags[k - 1] || m < mags[k + 1]) continue;
      const a = mags[k - 1];
      const c = mags[k + 1];
      const denom = a - 2 * m + c;
      const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      const freq = (k + delta) * binHz;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += m;
    }
  }
  let max = 0;
  for (let i = 0; i < 12; i++) max = Math.max(max, chroma[i]);
  if (max > 0) for (let i = 0; i < 12; i++) chroma[i] /= max;
  return chroma;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function estimateKey(chroma: Float32Array): { keyName: string; camelot: string; confidence: number } {
  let best = { score: -Infinity, pc: 0, minor: false };
  let second = -Infinity;
  for (let pc = 0; pc < 12; pc++) {
    const rotated = new Float32Array(12);
    for (let i = 0; i < 12; i++) rotated[i] = chroma[(i + pc) % 12];
    for (const minor of [false, true]) {
      const score = pearson(rotated, minor ? MINOR_PROFILE : MAJOR_PROFILE);
      if (score > best.score) {
        second = best.score;
        best = { score, pc, minor };
      } else if (score > second) second = score;
    }
  }
  const name = `${NOTE_NAMES[best.pc]} ${best.minor ? "minor" : "major"}`;
  const camelot = best.minor ? CAMELOT_MINOR[best.pc] : CAMELOT_MAJOR[best.pc];
  const confidence = Math.max(0, Math.min(1, best.score - Math.max(0, second)));
  return { keyName: name, camelot, confidence };
}

/**
 * Energy 1 to 10 from loudness (RMS), onset density and brightness (spectral centroid).
 * Previews are mastered loud, so the loudness scale is tight around club levels.
 */
export function estimateEnergy(samples: Float32Array, env: Float32Array, frameRate: number, sampleRate = 44100): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  const loud = Math.max(0, Math.min(1, (db + 24) / 14));

  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= Math.max(1, env.length);
  let varSum = 0;
  for (let i = 0; i < env.length; i++) varSum += (env[i] - mean) ** 2;
  const std = Math.sqrt(varSum / Math.max(1, env.length));
  let peaks = 0;
  for (let i = 1; i + 1 < env.length; i++) {
    if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > mean + std) peaks++;
  }
  const seconds = env.length / frameRate;
  const busy = Math.max(0, Math.min(1, peaks / Math.max(1, seconds) / 7));

  // Spectral centroid on a sparse set of frames.
  const N = 2048;
  const win = hann(N);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let cNum = 0;
  let cDen = 0;
  const step = N * 8;
  for (let off = 0; off + N <= samples.length; off += step) {
    for (let i = 0; i < N; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      cNum += p * k;
      cDen += p;
    }
  }
  const centroidHz = cDen > 0 ? (cNum / cDen) * (sampleRate / N) : 1000;
  const bright = Math.max(0, Math.min(1, (centroidHz - 700) / 2800));

  return Math.round(Math.max(1, Math.min(10, 1 + 9 * (0.45 * loud + 0.35 * busy + 0.2 * bright))));
}

export function analyzePcm(samples: Float32Array, sampleRate: number): Analysis {
  const { env, frameRate } = onsetEnvelope(samples, sampleRate);
  const tempo = estimateBpm(env, frameRate);
  const key = estimateKey(chromaVector(samples, sampleRate));
  const energy = estimateEnergy(samples, env, frameRate, sampleRate);
  return {
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    keyName: key.keyName,
    camelot: key.camelot,
    keyConfidence: key.confidence,
    energy,
  };
}

/** Mixes any number of channels down to mono. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}
