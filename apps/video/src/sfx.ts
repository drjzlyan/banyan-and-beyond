import type { SfxId } from "@banyan/core";
import { wavBlob } from "./audio.ts";

/**
 * Sound effects synthesized in the browser (Web Audio, OfflineAudioContext). No samples, no
 * downloads, no neurons: free-tier safe, and deterministic (seeded noise) so every render matches.
 */
const SR = 24000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.ceil(seconds * SR), SR);
  const d = b.getChannelData(0);
  const r = rng(seed);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return b;
}

type Ctx = OfflineAudioContext;

function noise(ctx: Ctx, out: AudioNode, at: number, len: number, seed: number, filter: BiquadFilterType, freq: number, q: number, env: [number, number][]) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, len, seed);
  const f = ctx.createBiquadFilter();
  f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  for (const [t, v] of env) g.gain.linearRampToValueAtTime(v, at + t);
  src.connect(f).connect(g).connect(out);
  src.start(at); src.stop(at + len);
}

function tone(ctx: Ctx, out: AudioNode, at: number, freq: number | [number, number], len: number, peak: number, type: OscillatorType = "sine", attack = 0.005) {
  const o = ctx.createOscillator();
  o.type = type;
  if (Array.isArray(freq)) { o.frequency.setValueAtTime(freq[0], at); o.frequency.exponentialRampToValueAtTime(freq[1], at + len); }
  else o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + len + 0.02);
}

const SOUNDS: Record<SfxId, { seconds: number; draw: (ctx: Ctx, out: AudioNode) => void }> = {
  birds: { seconds: 2.4, draw: (ctx, out) => {
    const r = rng(7);
    for (let i = 0; i < 9; i++) {
      const at = 0.1 + i * 0.24 + r() * 0.08;
      const base = 2600 + r() * 1400;
      tone(ctx, out, at, [base, base * 1.45], 0.07, 0.25);
      tone(ctx, out, at + 0.08, [base * 1.3, base * 0.9], 0.06, 0.18);
    }
  } },
  wind: { seconds: 3.2, draw: (ctx, out) => noise(ctx, out, 0, 3.2, 11, "bandpass", 500, 0.6, [[1.2, 0.55], [2.2, 0.45], [3.2, 0]]) },
  rain: { seconds: 3.2, draw: (ctx, out) => {
    noise(ctx, out, 0, 3.2, 21, "highpass", 1400, 0.5, [[0.5, 0.22], [2.6, 0.22], [3.2, 0]]);
    const r = rng(22);
    for (let i = 0; i < 40; i++) tone(ctx, out, r() * 3, 1800 + r() * 2500, 0.03, 0.08);
  } },
  river: { seconds: 3.2, draw: (ctx, out) => {
    noise(ctx, out, 0, 3.2, 31, "lowpass", 800, 0.7, [[0.6, 0.5], [2.6, 0.5], [3.2, 0]]);
    const r = rng(32);
    for (let i = 0; i < 18; i++) tone(ctx, out, 0.2 + r() * 2.6, [500 + r() * 400, 900 + r() * 600], 0.05, 0.06);
  } },
  bell: { seconds: 3.4, draw: (ctx, out) => {
    // temple bell: inharmonic partials, long decay, two strikes
    for (const at of [0, 1.3]) for (const [m, a] of [[1, 0.35], [2.76, 0.18], [5.4, 0.08], [8.93, 0.04]] as const) tone(ctx, out, at, 523 * m, 2.0, a, "sine", 0.003);
  } },
  crickets: { seconds: 2.6, draw: (ctx, out) => {
    for (let c = 0; c < 6; c++) for (let p = 0; p < 3; p++) tone(ctx, out, 0.1 + c * 0.42 + p * 0.045, 4600, 0.03, 0.12, "triangle", 0.003);
  } },
  footsteps: { seconds: 2.4, draw: (ctx, out) => {
    for (let i = 0; i < 6; i++) {
      const at = 0.1 + i * 0.36;
      noise(ctx, out, at, 0.09, 40 + i, "lowpass", 600, 0.8, [[0.005, 0.6], [0.09, 0]]);
      tone(ctx, out, at, [120, 70], 0.08, 0.35);
    }
  } },
  drum: { seconds: 2.2, draw: (ctx, out) => {
    // dholak-ish pattern: low "dhin" (pitch drop) and high "na" taps
    const pattern: [number, "lo" | "hi"][] = [[0, "lo"], [0.25, "hi"], [0.5, "hi"], [0.75, "lo"], [1.0, "lo"], [1.25, "hi"], [1.5, "lo"], [1.62, "hi"]];
    for (const [at, k] of pattern) {
      if (k === "lo") tone(ctx, out, at + 0.05, [140, 70], 0.32, 0.6);
      else { tone(ctx, out, at + 0.05, [520, 380], 0.12, 0.25); noise(ctx, out, at + 0.05, 0.05, 50, "bandpass", 2500, 1, [[0.003, 0.25], [0.05, 0]]); }
    }
  } },
  flute: { seconds: 2.8, draw: (ctx, out) => {
    // a little pentatonic phrase (Sa Re Ga Pa Ga Re Sa) with vibrato and breath
    const notes = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25];
    notes.forEach((f, i) => {
      const at = 0.05 + i * 0.36;
      const o = ctx.createOscillator(); o.frequency.value = f;
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5;
      const vg = ctx.createGain(); vg.gain.value = f * 0.008;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.28, at + 0.06); g.gain.linearRampToValueAtTime(0.22, at + 0.28); g.gain.linearRampToValueAtTime(0, at + (i === notes.length - 1 ? 0.7 : 0.38));
      o.connect(g).connect(out);
      o.start(at); vib.start(at); o.stop(at + 0.8); vib.stop(at + 0.8);
      noise(ctx, out, at, 0.3, 60 + i, "bandpass", f * 2, 2, [[0.03, 0.04], [0.3, 0]]);
    });
  } },
  chime: { seconds: 2.0, draw: (ctx, out) => {
    [1568, 1976, 2349, 2637, 3136].forEach((f, i) => { tone(ctx, out, 0.05 + i * 0.09, f, 1.2, 0.18, "sine", 0.002); tone(ctx, out, 0.05 + i * 0.09, f * 2, 0.6, 0.04); });
  } },
  splash: { seconds: 1.4, draw: (ctx, out) => {
    noise(ctx, out, 0, 0.6, 70, "bandpass", 1500, 0.6, [[0.01, 0.7], [0.6, 0]]);
    const r = rng(71);
    for (let i = 0; i < 10; i++) tone(ctx, out, 0.2 + r() * 0.9, [900 + r() * 900, 1800 + r() * 900], 0.05, 0.1);
  } },
  knock: { seconds: 1.4, draw: (ctx, out) => {
    for (const at of [0.05, 0.3, 0.55]) { noise(ctx, out, at, 0.07, 80, "bandpass", 350, 1.5, [[0.003, 0.9], [0.07, 0]]); tone(ctx, out, at, [210, 150], 0.08, 0.4); }
  } },
};

export const SFX_SECONDS: Record<SfxId, number> = Object.fromEntries(Object.entries(SOUNDS).map(([k, v]) => [k, v.seconds])) as Record<SfxId, number>;

async function render(seconds: number, draw: (ctx: Ctx, out: AudioNode) => void): Promise<string> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  draw(ctx, master);
  return URL.createObjectURL(wavBlob(await ctx.startRendering()));
}

const cache = new Map<string, Promise<string>>();

/** Blob URL of one synthesized effect (cached for the page's lifetime). */
export function sfxUrl(id: SfxId): Promise<string> {
  if (!cache.has(id)) cache.set(id, render(SOUNDS[id].seconds, SOUNDS[id].draw));
  return cache.get(id)!;
}

export const AMBIENCE_SECONDS = 16;

/** A soft evening bed (crickets + breeze) that loops under the whole chapter. */
export function ambienceUrl(): Promise<string> {
  if (!cache.has("ambience")) {
    cache.set("ambience", render(AMBIENCE_SECONDS, (ctx, out) => {
      noise(ctx, out, 0, AMBIENCE_SECONDS, 90, "bandpass", 450, 0.5, [[2, 0.18], [8, 0.12], [14, 0.18], [AMBIENCE_SECONDS, 0.0]]);
      const r = rng(91);
      for (let c = 0; c < 22; c++) {
        const at = r() * (AMBIENCE_SECONDS - 1);
        for (let p = 0; p < 3; p++) tone(ctx, out, at + p * 0.05, 4400 + r() * 500, 0.03, 0.05, "triangle", 0.003);
      }
    }));
  }
  return cache.get("ambience")!;
}
