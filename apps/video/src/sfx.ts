import { SFX_IDS, type SfxId } from "@banyan/core";
import { wavBlob } from "./audio.ts";
import { tabla } from "./jingle.ts";

/**
 * Sound effects. Recorded CC0 / public-domain samples are bundled with the Studio
 * (src/sounds/<id>.ogg, sources and licences in sounds.json); everything else (wind, music,
 * cartoon foley) is synthesized in the browser with seeded Web Audio, so every render matches.
 * No downloads at render time and no neurons: free-tier safe.
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

export function noise(ctx: Ctx, out: AudioNode, at: number, len: number, seed: number, filter: BiquadFilterType, freq: number, q: number, env: [number, number][]) {
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

export function tone(ctx: Ctx, out: AudioNode, at: number, freq: number | [number, number], len: number, peak: number, type: OscillatorType = "sine", attack = 0.005) {
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

type Synth = { seconds: number; draw: (ctx: Ctx, out: AudioNode) => void };

/** A frequency glide with a gain envelope (the cartoon foley building block). */
export function glide(ctx: Ctx, out: AudioNode, at: number, f: [number, number][], len: number, peak: number, type: OscillatorType = "sine") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f[0]![1], at + f[0]![0]);
  for (const [t, v] of f.slice(1)) o.frequency.exponentialRampToValueAtTime(v, at + t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
  g.gain.setValueAtTime(peak, at + len * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g).connect(out);
  o.start(at); o.stop(at + len + 0.02);
}

const SYNTH: Partial<Record<SfxId, Synth>> = {
  wind: { seconds: 3.2, draw: (ctx, out) => noise(ctx, out, 0, 3.2, 11, "bandpass", 500, 0.6, [[1.2, 0.55], [2.2, 0.45], [3.2, 0]]) },
  crickets: { seconds: 2.6, draw: (ctx, out) => {
    for (let c = 0; c < 6; c++) for (let p = 0; p < 3; p++) tone(ctx, out, 0.1 + c * 0.42 + p * 0.045, 4600, 0.03, 0.12, "triangle", 0.003);
  } },
  drum: { seconds: 1.9, draw: (ctx, out) => {
    // a festive dholak chaal on the jingle's tabla strokes: heavy bass DHA, bending "ge", ringing "na" (owner's pick, 2026-10-22)
    const g = ctx.createGain(); g.gain.value = 1.1; g.connect(out);
    const bols = ["DHA", null, "ge", "na", "DHA", "ge", "na", "ge", "DHA", null] as const;
    bols.forEach((b, i) => { if (b) tabla(ctx, g, 0.05 + i * 0.15, b, 10 + i, b === "ge" || b === "DHA" ? 1.2 : 1); });
    tabla(ctx, g, 0.05 + bols.length * 0.15, "DHA", 99, 1.3);
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
  // cartoon foley
  slip: { seconds: 0.95, draw: (ctx, out) => {
    // slide whistle straight down with breath and vibrato, then a soft bump (owner's pick, 2026-10-22)
    const len = 0.72;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(1500, 0); o.frequency.exponentialRampToValueAtTime(260, 0.7);
    const vib = ctx.createOscillator(), va = ctx.createGain(); vib.frequency.value = 6.5; va.gain.value = 14; vib.connect(va).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.45, 0.04); g.gain.setValueAtTime(0.42, len - 0.12); g.gain.exponentialRampToValueAtTime(0.0001, len);
    o.connect(g).connect(out); o.start(0); vib.start(0); o.stop(len + 0.05); vib.stop(len + 0.05);
    noise(ctx, out, 0, len, 5, "bandpass", 2400, 1.2, [[0.04, 0.07], [len - 0.1, 0.05], [len, 0]]);
    glide(ctx, out, len - 0.02, [[0, 160], [0.18, 70]], 0.22, 0.8);
    noise(ctx, out, len - 0.02, 0.12, 9, "lowpass", 500, 0.7, [[0.005, 0.7], [0.12, 0]]);
  } },
  pop: { seconds: 0.3, draw: (ctx, out) => { glide(ctx, out, 0, [[0, 400], [0.06, 1400]], 0.12, 0.5); noise(ctx, out, 0, 0.04, 19, "bandpass", 2500, 1, [[0.002, 0.3], [0.04, 0]]); } },
  zip: { seconds: 0.6, draw: (ctx, out) => { noise(ctx, out, 0, 0.5, 23, "bandpass", 2000, 2, [[0.05, 0.5], [0.45, 0.2], [0.5, 0]]); glide(ctx, out, 0, [[0, 300], [0.45, 1800]], 0.5, 0.12, "sawtooth"); } },
  swish: { seconds: 0.45, draw: (ctx, out) => noise(ctx, out, 0, 0.4, 29, "bandpass", 1600, 1.2, [[0.12, 0.6], [0.4, 0]]) },
  tiptoe: { seconds: 1.3, draw: (ctx, out) => { [0, 0.3, 0.6, 0.9].forEach((at, i) => tone(ctx, out, at, [988, 1319, 988, 1175][i]!, 0.18, 0.22, "triangle", 0.002)); } },
  squeak: { seconds: 0.4, draw: (ctx, out) => glide(ctx, out, 0, [[0, 1800], [0.1, 2600], [0.25, 2200]], 0.3, 0.2) },
};

/** Bundled recordings (Vite hashes them into the build). */
const SAMPLES = import.meta.glob("./sounds/*.ogg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const sampleUrl = (id: SfxId) => SAMPLES[`./sounds/${id}.ogg`];

/** Ids that have a recording, for the Studio's sound list. */
export const RECORDED = SFX_IDS.filter((id) => sampleUrl(id));

async function render(seconds: number, draw: (ctx: Ctx, out: AudioNode) => void): Promise<string> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  draw(ctx, master);
  return URL.createObjectURL(wavBlob(await ctx.startRendering()));
}

const cache = new Map<string, Promise<string>>();
const sfxCache = new Map<SfxId, Promise<{ url: string; seconds: number }>>();

/** One effect: its URL and length. Recorded if bundled, else synthesized (cached for the page's lifetime). */
export function sfx(id: SfxId): Promise<{ url: string; seconds: number }> {
  if (!sfxCache.has(id)) {
    sfxCache.set(id, (async () => {
      const url = sampleUrl(id);
      if (url) {
        const ctx = new OfflineAudioContext(1, 1, SR);
        const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
        return { url, seconds: buf.duration };
      }
      const s = SYNTH[id];
      if (!s) throw new Error(`no sample or synth for sound "${id}"`);
      return { url: await render(s.seconds, s.draw), seconds: s.seconds };
    })());
  }
  return sfxCache.get(id)!;
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
