import { wavBlob } from "./audio.ts";

/**
 * The Banyan and Beyond sonic logo, synthesized in the browser like the sound effects: no samples,
 * no licences, no neurons, and deterministic (seeded noise, fixed score) so every video carries the
 * identical tune — that sameness is what makes viewers recognise the channel.
 *
 * The motif follows the rhythm of the name, "BAN-yan and be-YOND": four quick notes and a long one
 * that leaps up, played on a bansuri-style flute over tabla and a tanpura drone, in the cheerful
 * Bhoopali pentatonic (Sa Re Ga Pa Dha). An answer phrase comes back down, then a tabla tihai (the
 * same little figure three times) lands on high Sa with a temple bell.
 *
 * One score, three cuts: "intro" (chapter 1), "sting" (first phrase only, every other chapter) and
 * "outro" (slower reprise under the lesson card). Visuals sync to `jingleHits`.
 */
const SR = 32000;
const SA = 293.66; // D4
const hz = (semi: number) => SA * 2 ** (semi / 12);

export type JingleCut = "intro" | "sting" | "outro";
export type JingleVariant = "classic" | "bouncy" | "gentle";
/** The owner's pick (brand decision; see the jingle MP3s in the hand-off). */
export const JINGLE_VARIANT: JingleVariant = "classic";

type Note = { t: number; d: number; n: number; slide?: boolean };
type Score = { a: Note[]; b: Note[]; tihai: number[]; final: number; tempo: number };

/** Phrase timing is in beats of 0.5 s (120 bpm); `tempo` stretches it. Notes in semitones from Sa. */
const SCORES: Record<JingleVariant, Score> = {
  // Ban - yan - and - Be - YOND (leap to high Sa) | answer walks home | tihai Ga-Re-Sa ×3
  classic: {
    a: [{ t: 0, d: 0.5, n: 7 }, { t: 0.5, d: 0.5, n: 4 }, { t: 1, d: 0.5, n: 7 }, { t: 1.5, d: 0.5, n: 9 }, { t: 2, d: 2, n: 12, slide: true }],
    b: [{ t: 0, d: 0.5, n: 9 }, { t: 0.5, d: 0.5, n: 7 }, { t: 1, d: 0.5, n: 4 }, { t: 1.5, d: 0.5, n: 2 }, { t: 2, d: 1, n: 0 }],
    tihai: [4, 2, 0], final: 12, tempo: 1,
  },
  // same name rhythm, skipping upward like a kid on a hopscotch grid
  bouncy: {
    a: [{ t: 0, d: 0.5, n: 0 }, { t: 0.5, d: 0.5, n: 4 }, { t: 1, d: 0.5, n: 7 }, { t: 1.5, d: 0.5, n: 4 }, { t: 2, d: 2, n: 9, slide: true }],
    b: [{ t: 0, d: 0.5, n: 12 }, { t: 0.5, d: 0.5, n: 9 }, { t: 1, d: 0.5, n: 7 }, { t: 1.5, d: 0.5, n: 4 }, { t: 2, d: 1, n: 7 }],
    tihai: [9, 7, 4], final: 12, tempo: 0.9,
  },
  // softer lullaby contour, a little slower
  gentle: {
    a: [{ t: 0, d: 0.5, n: 4 }, { t: 0.5, d: 0.5, n: 2 }, { t: 1, d: 0.5, n: 4 }, { t: 1.5, d: 0.5, n: 7 }, { t: 2, d: 2, n: 9, slide: true }],
    b: [{ t: 0, d: 0.5, n: 7 }, { t: 0.5, d: 0.5, n: 4 }, { t: 1, d: 0.5, n: 2 }, { t: 1.5, d: 0.5, n: -3 }, { t: 2, d: 1, n: 0 }],
    tihai: [4, 2, 0], final: 7, tempo: 1.15,
  },
};

const BEAT = 0.5;
type Layout = { seconds: number; a: number; b: number | null; tihai: number | null; finalAt: number; stretch: number };

function layout(cut: JingleCut, v: JingleVariant): Layout {
  const s = SCORES[v];
  const k = s.tempo * (cut === "outro" ? 1.3 : 1);
  const beat = BEAT * k;
  if (cut === "sting") return { seconds: 3, a: 0.3, b: null, tihai: null, finalAt: 0.3 + 2 * beat, stretch: k };
  const a = 0.5, b = a + 4 * beat, tihai = b + 3 * beat;
  // tihai: three groups of three quick notes, each group a beat apart; the third lands on the final
  const finalAt = tihai + 2 * beat + 2 * (beat / 4);
  return { seconds: cut === "outro" ? 9 : Math.max(6.5, finalAt + 1.4), a, b, tihai, finalAt, stretch: k };
}

export const JINGLE_SECONDS: Record<JingleCut, number> = {
  intro: layout("intro", JINGLE_VARIANT).seconds,
  sting: layout("sting", JINGLE_VARIANT).seconds,
  outro: layout("outro", JINGLE_VARIANT).seconds,
};

/** When the motif's five name-notes and the final landing happen, for syncing the title animation. */
export function jingleHits(cut: JingleCut, v: JingleVariant = JINGLE_VARIANT): { words: number[]; final: number } {
  const L = layout(cut, v);
  return { words: SCORES[v].a.map((n) => L.a + n.t * L.stretch), final: L.finalAt };
}

// ---------- instruments ----------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
type Ctx = OfflineAudioContext;

function noiseSrc(ctx: Ctx, seconds: number, seed: number) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * SR), SR);
  const d = b.getChannelData(0), r = rng(seed);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = b;
  return src;
}

function env(g: GainNode, at: number, points: [number, number][]) {
  g.gain.setValueAtTime(0.0001, at);
  for (const [t, v] of points) g.gain.linearRampToValueAtTime(v, at + t);
}

/** Bansuri: soft sine + a little triangle, breath chiff on the attack, vibrato on held notes, meend (slide) into leaps. */
function flute(ctx: Ctx, out: AudioNode, at: number, len: number, f: number, from: number | null, seed: number, level = 0.22) {
  const g = ctx.createGain();
  env(g, at, [[0.045, level], [Math.max(0.06, len - 0.06), level * 0.85], [len + 0.12, 0.0001]]);
  g.connect(out);
  const vib = ctx.createOscillator(), vibAmt = ctx.createGain();
  vib.frequency.value = 5.4; vibAmt.gain.setValueAtTime(0, at); vibAmt.gain.linearRampToValueAtTime(len > 0.6 ? f * 0.012 : f * 0.003, at + Math.min(len, 0.5));
  vib.connect(vibAmt);
  for (const [type, mul, lvl] of [["sine", 1, 1], ["triangle", 1, 0.18], ["sine", 2, 0.12]] as const) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = type; og.gain.value = lvl;
    if (from) { o.frequency.setValueAtTime(from * mul, at); o.frequency.exponentialRampToValueAtTime(f * mul, at + 0.11); } else o.frequency.setValueAtTime(f * mul, at);
    vibAmt.connect(o.frequency);
    o.connect(og).connect(g);
    o.start(at); o.stop(at + len + 0.2);
  }
  vib.start(at); vib.stop(at + len + 0.2);
  // breath: band-passed noise, strongest at the attack
  const n = noiseSrc(ctx, len + 0.2, seed), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
  bp.type = "bandpass"; bp.frequency.value = f * 2.2; bp.Q.value = 1.4;
  env(ng, at, [[0.02, level * 0.5], [0.12, level * 0.12], [len, level * 0.08], [len + 0.1, 0.0001]]);
  n.connect(bp).connect(ng).connect(out); n.start(at); n.stop(at + len + 0.2);
}

/** Santoor-like pluck: bright triangle + octave, quick decay. */
function pluck(ctx: Ctx, out: AudioNode, at: number, f: number, level = 0.07) {
  for (const [mul, lvl] of [[1, 1], [2, 0.35], [3.01, 0.12]] as const) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f * mul;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(level * lvl, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    o.connect(g).connect(out); o.start(at); o.stop(at + 1);
  }
}

/** Tabla strokes: bayan (low, pitch-bending "ge"), dayan (ringing "na"/"tin"), and dry "ka". */
export function tabla(ctx: Ctx, out: AudioNode, at: number, stroke: "dha" | "ge" | "na" | "tin" | "ka" | "DHA", seed: number, level = 1) {
  const hit = (f0: number, f1: number, len: number, peak: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak * level, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(out); o.start(at); o.stop(at + len + 0.02);
  };
  const click = (freq: number, peak: number) => {
    const n = noiseSrc(ctx, 0.05, seed), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 2;
    g.gain.setValueAtTime(peak * level, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    n.connect(f).connect(g).connect(out); n.start(at); n.stop(at + 0.05);
  };
  const ge = (big = false) => hit(big ? 82 : 95, big ? 118 : 108, big ? 0.7 : 0.35, big ? 0.5 : 0.3); // bayan bends up
  const na = (f = 590) => { hit(f, f * 0.985, 0.32, 0.16); hit(f * 2.01, f * 1.98, 0.18, 0.05); click(3200, 0.08); };
  if (stroke === "ge") ge();
  else if (stroke === "na") na();
  else if (stroke === "tin") na(700);
  else if (stroke === "ka") click(1800, 0.14);
  else { ge(stroke === "DHA"); na(); }
}

/** Temple bell: inharmonic partials, long ring. */
function bell(ctx: Ctx, out: AudioNode, at: number, f: number, level = 0.12, len = 2.8) {
  for (const [mul, lvl, d] of [[1, 1, 1], [2.02, 0.5, 0.7], [2.76, 0.4, 0.55], [5.4, 0.2, 0.3], [8.93, 0.1, 0.18]] as const) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f * mul;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(level * lvl, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + len * d);
    o.connect(g).connect(out); o.start(at); o.stop(at + len + 0.05);
  }
}

/** Tanpura-ish drone on Sa and Pa: filtered saws breathing in and out. */
function drone(ctx: Ctx, out: AudioNode, from: number, to: number, level = 0.05) {
  const lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = "lowpass"; lp.frequency.value = 1100; lp.Q.value = 0.7;
  env(g, from, [[0.8, level], [Math.max(0.9, to - from - 1.5), level * 0.9], [to - from, 0.0001]]);
  lp.connect(g).connect(out);
  for (const [f, d] of [[SA / 2, 0], [hz(7) / 2, 0.7], [SA, 1.4], [SA / 4, 0.2]] as const) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sawtooth"; o.frequency.value = f; o.detune.value = d * 3;
    og.gain.value = f < 100 ? 0.5 : 0.3;
    o.connect(og).connect(lp); o.start(from); o.stop(to);
  }
}

/** Rising sparkle of little chimes, the "once upon a time" shimmer. */
function sparkle(ctx: Ctx, out: AudioNode, at: number, level = 0.05) {
  [0, 2, 4, 7, 9, 12, 14, 16].forEach((n, i) => bell(ctx, out, at + i * 0.045, hz(n + 24), level * (0.6 + i * 0.06), 0.7));
}

// ---------- the arrangement ----------

function arrange(ctx: Ctx, out: AudioNode, cut: JingleCut, v: JingleVariant) {
  const s = SCORES[v], L = layout(cut, v), k = L.stretch, beat = BEAT * k;
  drone(ctx, out, 0, L.seconds, cut === "sting" ? 0.04 : 0.05);
  sparkle(ctx, out, cut === "sting" ? 0 : 0.05);

  const phrase = (notes: Note[], at: number, seed: number) => {
    let prev: number | null = null;
    for (const [i, n] of notes.entries()) {
      flute(ctx, out, at + n.t * k, n.d * k * 0.92, hz(n.n), n.slide && prev ? hz(prev) : null, seed + i);
      prev = n.n;
    }
  };
  // the sting ends on the motif's own long note, played as the landing below
  phrase(cut === "sting" ? s.a.slice(0, 4) : s.a, L.a, 10);
  // santoor chords under the long notes; tabla keherwa groove under the phrases
  const chord = (at: number, root: number) => [0, 4, 7, 12].forEach((n, i) => pluck(ctx, out, at + i * 0.03, hz(root + n)));
  chord(L.a, 0);
  chord(L.a + 2 * beat, s.a[4]!.n >= 9 ? 5 : 0);
  const theka = ["dha", "ge", "na", "tin", "na", "ka", "dha", "na"] as const;
  const grooveEnd = L.tihai ?? L.finalAt;
  for (let t = L.a, i = 0; t < grooveEnd - 0.01; t += beat / 2, i++) tabla(ctx, out, t, theka[i % 8]!, 100 + i, 0.8);

  if (L.b !== null) {
    phrase(s.b, L.b, 20);
    chord(L.b, 7);
    chord(L.b + 2 * beat, 0);
  }
  if (L.tihai !== null) {
    // three groups of three quick notes (flute + tabla together); the third group lands on the final note
    for (let g = 0; g < 3; g++) {
      s.tihai.forEach((n, j) => {
        const at = L.tihai! + g * beat + j * (beat / 4);
        const last = g === 2 && j === 2;
        if (!last) { flute(ctx, out, at, beat / 4, hz(n), null, 40 + g * 3 + j, 0.18); tabla(ctx, out, at, j === 0 ? "dha" : "na", 200 + g * 3 + j); }
      });
    }
  }
  // the landing: high note, big DHA, bell and a full chord ringing out
  const f = L.finalAt;
  const ring = Math.max(0.8, L.seconds - f - 0.6);
  const land = cut === "sting" ? s.a[4]!.n : s.final;
  flute(ctx, out, f, Math.min(1.6, ring), hz(land), hz(cut === "sting" ? s.a[3]!.n : s.tihai[1] ?? 0), 60, 0.24);
  tabla(ctx, out, f, "DHA", 300, cut === "sting" ? 0.7 : 1);
  bell(ctx, out, f, hz(24), cut === "sting" ? 0.08 : 0.11, 2.6);
  [0, 4, 7, 12, 16].forEach((n, i) => pluck(ctx, out, f + i * 0.035, hz(n), 0.06));
}

const cache = new Map<string, Promise<string>>();

/** Blob URL (WAV) of one cut of the jingle; cached for the page's lifetime. */
export function jingleUrl(cut: JingleCut, v: JingleVariant = JINGLE_VARIANT): Promise<string> {
  const key = `${cut}:${v}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const ctx = new OfflineAudioContext(1, Math.ceil(layout(cut, v).seconds * SR), SR);
      // gentle bus compression keeps the drum peaks in line with the dialogue
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
      const master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(comp).connect(ctx.destination);
      arrange(ctx, master, cut, v);
      return URL.createObjectURL(wavBlob(await ctx.startRendering()));
    })());
  }
  return cache.get(key)!;
}

// ---------- the story bed and little interface sounds, from the same instruments ----------

/** Loop length of the quiet music bed that sits under the story. */
export const BED_SECONDS = 24;

/**
 * A gentle bed in the jingle's key: tanpura drone, slow santoor arpeggios and, once per loop, the
 * brand motif on a far-away flute — so the tune keeps living under the story without competing
 * with the voices (the video ducks it further while anyone speaks).
 */
function arrangeBed(ctx: Ctx, out: AudioNode) {
  // drone held at a steady level the whole loop, so loop seams don't dip
  const lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = "lowpass"; lp.frequency.value = 900;
  g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.035, 0.05);
  g.gain.setValueAtTime(0.035, BED_SECONDS - 0.05); g.gain.linearRampToValueAtTime(0, BED_SECONDS);
  lp.connect(g).connect(out);
  for (const [f, d] of [[SA / 2, 0], [hz(7) / 2, 0.7], [SA, 1.4]] as const) {
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = d * 3;
    const og = ctx.createGain(); og.gain.value = 0.35; o.connect(og).connect(lp); o.start(0); o.stop(BED_SECONDS);
  }
  // eight bars of four plucks: Sa, Dha, Ga, Pa colours, rising then settling
  const roots = [0, -3, 4, 7, 0, 9, 4, 2];
  roots.forEach((root, bar) => [0, 7, 12, 16].forEach((n, k) => pluck(ctx, out, bar * 3 + k * 0.75 + 0.2, hz(root + n - 12), k === 0 ? 0.05 : 0.035)));
  // the motif, far away, once per loop
  SCORES[JINGLE_VARIANT].a.forEach((n, i) => flute(ctx, out, 12.2 + n.t * 0.75, n.d * 0.75 * 0.9, hz(n.n), null, 500 + i, 0.06));
}

export type UiSound = "pop" | "sparkle" | "whoosh";
export const UI_SECONDS: Record<UiSound, number> = { pop: 0.35, sparkle: 1.2, whoosh: 0.9 };

function arrangeUi(ctx: Ctx, out: AudioNode, s: UiSound) {
  if (s === "pop") {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(380, 0); o.frequency.exponentialRampToValueAtTime(980, 0.07);
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.25, 0.01); g.gain.exponentialRampToValueAtTime(0.0001, 0.18);
    o.connect(g).connect(out); o.start(0); o.stop(0.2);
    tabla(ctx, out, 0, "ka", 900, 0.6);
  } else if (s === "sparkle") {
    sparkle(ctx, out, 0, 0.07);
  } else {
    const n = noiseSrc(ctx, 0.9, 77), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = "bandpass"; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(400, 0); bp.frequency.exponentialRampToValueAtTime(2200, 0.6);
    env(g, 0, [[0.35, 0.12], [0.85, 0.0001]]);
    n.connect(bp).connect(g).connect(out); n.start(0); n.stop(0.9);
  }
}

async function renderClip(seconds: number, draw: (ctx: Ctx, out: AudioNode) => void, gain = 0.85): Promise<string> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  const master = ctx.createGain(); master.gain.value = gain; master.connect(ctx.destination);
  draw(ctx, master);
  return URL.createObjectURL(wavBlob(await ctx.startRendering()));
}

/** Blob URL of the looping story bed. */
export function bedUrl(): Promise<string> {
  if (!cache.has("bed")) cache.set("bed", renderClip(BED_SECONDS, arrangeBed));
  return cache.get("bed")!;
}

/** Blob URL of one interface sound (pop for sound words, sparkle for the lesson, whoosh for the closing iris). */
export function uiSoundUrl(s: UiSound): Promise<string> {
  const key = `ui:${s}`;
  if (!cache.has(key)) cache.set(key, renderClip(UI_SECONDS[s], (ctx, out) => arrangeUi(ctx, out, s)));
  return cache.get(key)!;
}
