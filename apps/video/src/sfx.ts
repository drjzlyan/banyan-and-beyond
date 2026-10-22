import { SFX_IDS, type SfxId } from "@banyan/core";
import { wavBlob } from "./audio.ts";

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

type Synth = { seconds: number; draw: (ctx: Ctx, out: AudioNode) => void };

/** A frequency glide with a gain envelope (the cartoon foley building block). */
function glide(ctx: Ctx, out: AudioNode, at: number, f: [number, number][], len: number, peak: number, type: OscillatorType = "sine") {
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
  // cartoon foley
  boing: { seconds: 0.7, draw: (ctx, out) => {
    // a sprung "boing": pitch wobbles as it rises, vibrato decaying
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(180, 0); o.frequency.exponentialRampToValueAtTime(520, 0.12); o.frequency.exponentialRampToValueAtTime(330, 0.6);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 18; const lg = ctx.createGain(); lg.gain.setValueAtTime(70, 0); lg.gain.exponentialRampToValueAtTime(2, 0.6);
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.5, 0.01); g.gain.exponentialRampToValueAtTime(0.0001, 0.65);
    o.connect(g).connect(out); o.start(0); lfo.start(0); o.stop(0.7); lfo.stop(0.7);
  } },
  slip: { seconds: 0.9, draw: (ctx, out) => {
    // slide whistle up then a quick drop
    glide(ctx, out, 0, [[0, 600], [0.35, 1500], [0.75, 280]], 0.8, 0.28);
    noise(ctx, out, 0.7, 0.15, 13, "lowpass", 300, 0.7, [[0.01, 0.4], [0.15, 0]]);
  } },
  bonk: { seconds: 0.5, draw: (ctx, out) => { tone(ctx, out, 0, [300, 90], 0.3, 0.6); noise(ctx, out, 0, 0.08, 17, "lowpass", 900, 0.7, [[0.004, 0.5], [0.08, 0]]); } },
  pop: { seconds: 0.3, draw: (ctx, out) => { glide(ctx, out, 0, [[0, 400], [0.06, 1400]], 0.12, 0.5); noise(ctx, out, 0, 0.04, 19, "bandpass", 2500, 1, [[0.002, 0.3], [0.04, 0]]); } },
  zip: { seconds: 0.6, draw: (ctx, out) => { noise(ctx, out, 0, 0.5, 23, "bandpass", 2000, 2, [[0.05, 0.5], [0.45, 0.2], [0.5, 0]]); glide(ctx, out, 0, [[0, 300], [0.45, 1800]], 0.5, 0.12, "sawtooth"); } },
  swish: { seconds: 0.45, draw: (ctx, out) => noise(ctx, out, 0, 0.4, 29, "bandpass", 1600, 1.2, [[0.12, 0.6], [0.4, 0]]) },
  tiptoe: { seconds: 1.3, draw: (ctx, out) => { [0, 0.3, 0.6, 0.9].forEach((at, i) => tone(ctx, out, at, [988, 1319, 988, 1175][i]!, 0.18, 0.22, "triangle", 0.002)); } },
  squeak: { seconds: 0.4, draw: (ctx, out) => glide(ctx, out, 0, [[0, 1800], [0.1, 2600], [0.25, 2200]], 0.3, 0.2) },
  munch: { seconds: 1.2, draw: (ctx, out) => { for (let i = 0; i < 4; i++) noise(ctx, out, 0.05 + i * 0.27, 0.12, 31 + i, "bandpass", 2200, 0.8, [[0.005, 0.7], [0.12, 0]]); } },
  cart: { seconds: 2.4, draw: (ctx, out) => {
    // bullock hooves, clip-clop, over a wooden wheel creak
    for (let i = 0; i < 8; i++) { const at = 0.1 + i * 0.28; noise(ctx, out, at, 0.06, 41 + i, "bandpass", i % 2 ? 900 : 650, 3, [[0.003, 0.7], [0.06, 0]]); }
    glide(ctx, out, 0.4, [[0, 180], [0.6, 220], [1.2, 170]], 1.6, 0.05, "sawtooth");
  } },
  market: { seconds: 3, draw: (ctx, out) => {
    // a soft hubbub: formant-filtered noise murmurs plus a few distant calls
    noise(ctx, out, 0, 3, 47, "bandpass", 700, 1.5, [[0.4, 0.35], [2.6, 0.35], [3, 0]]);
    const r = rng(48);
    for (let i = 0; i < 5; i++) { const at = 0.2 + r() * 2.4; glide(ctx, out, at, [[0, 300 + r() * 150], [0.3, 420 + r() * 200]], 0.35, 0.05, "triangle"); }
  } },
  crow: { seconds: 1.4, draw: (ctx, out) => {
    // "caw caw": raspy sawtooth through a nasal band-pass
    for (const at of [0.05, 0.6]) {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(620, at); o.frequency.linearRampToValueAtTime(520, at + 0.35);
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1300; f.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.5, at + 0.03); g.gain.linearRampToValueAtTime(0, at + 0.38);
      o.connect(f).connect(g).connect(out); o.start(at); o.stop(at + 0.4);
    }
  } },
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
