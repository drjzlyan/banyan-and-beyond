import type { AudioRunner } from "./ai.ts";
import type { ClipPart, DialogueLine } from "./types.ts";

/** Deepgram Aura-2 English (same model chota.vc uses live). */
export const TTS_MODEL = "@cf/deepgram/aura-2-en";
/** Ajja's voice. Kid voice TBD by the owner's ear check (deferred); defaults to Luna pitched up in the browser. */
export const AJJA_SPEAKER = "luna";
export const KID_SPEAKER = "luna";
/** Browser pitch shifts: Ajja down (warm elder), Kid up (young). Owner confirms by ear. */
export const AJJA_PITCH = 0.9;
export const KID_PITCH = 1.3;

export const TTS_BIT_RATE = 48000;
export const TTS_SAMPLE_RATE = 24000;

export function mp3Duration(byteLength: number): number {
  return (byteLength * 8) / TTS_BIT_RATE;
}

export interface TimedLine {
  index: number;
  speaker: DialogueLine["speaker"];
  text: string;
  start: number;
  end: number;
  words: { text: string; start: number; end: number }[];
}

/** Character-weight word timing so captions highlight in sync (port of chota layoutTimeline). */
export function layoutLines(parts: (ClipPart & { speaker: DialogueLine["speaker"] })[]): { clips: TimedLine[]; duration: number } {
  let t = 0;
  const clips = parts.map((p, index) => {
    const start = t;
    const end = t + p.duration;
    t = end + 0.35; // breath pause between lines
    const total = p.text.length || 1;
    let wt = start;
    const words = p.text.split(/\s+/).map((w) => {
      const d = ((w.length + 1) / (total + 1)) * p.duration;
      const s = wt;
      wt += d;
      return { text: w, start: s, end: Math.min(wt, end) };
    });
    return { index, speaker: p.speaker, text: p.text, start, end, words };
  });
  return { clips, duration: Math.max(0, t - 0.35) };
}

/** Plan re-voicing after a script edit: keep clips whose text is unchanged. */
export function planLineClips(
  old: { speaker: string; text: string; start: number; end: number }[],
  spoken: string,
): { text: string; speaker: DialogueLine["speaker"]; keep: { start: number; end: number } | null }[] {
  const next = spoken.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(AJJA|KID):\s*(.+)$/);
    return m ? { speaker: m[1] as DialogueLine["speaker"], text: m[2].trim() } : null;
  });
  const byText = new Map(old.map((c) => [`${c.speaker}:${c.text}`, c]));
  return next.map((n) => {
    if (!n) return { text: "", speaker: "AJJA" as const, keep: null };
    const hit = byText.get(`${n.speaker}:${n.text}`);
    byText.delete(`${n.speaker}:${n.text}`);
    return { ...n, keep: hit ? { start: hit.start, end: hit.end } : null };
  });
}

/** Which Aura voice speaks a dialogue line. */
export function speakerFor(speaker: DialogueLine["speaker"]): string {
  return speaker === "KID" ? KID_SPEAKER : AJJA_SPEAKER;
}

/** One TTS call with retries. Throws so the caller (Workflow step / cron loop) can retry later. */
export async function synthesizeLine(
  tts: AudioRunner,
  speaker: DialogueLine["speaker"],
  text: string,
  opts: { model?: string } = {},
  retries = 2,
): Promise<ArrayBuffer> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const audio = await tts(opts.model ?? TTS_MODEL, { text, speaker: speakerFor(speaker), encoding: "mp3", bit_rate: TTS_BIT_RATE });
      if (audio.byteLength < 500) throw new Error(`suspiciously small audio (${audio.byteLength} bytes)`);
      return audio;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error(`TTS failed for "${text.slice(0, 40)}": ${(last as Error).message}`);
}

/**
 * Nightly TTS char budget. Aura-2 costs ≈2,727 neurons/1k chars against a 10k/day
 * allowance shared with story generation, so one cron run voices at most this many
 * chars and resumes the next night. Pure + unit-tested.
 */
export const NIGHTLY_TTS_CHAR_BUDGET = 3000;

/** Split dialogue lines into tonight's share (fits the budget) and the remainder. */
export function splitNightlyShare(lines: DialogueLine[]): { tonight: DialogueLine[]; later: DialogueLine[] } {
  let used = 0;
  let cut = 0;
  for (const [i, l] of lines.entries()) {
    if (used + l.text.length > NIGHTLY_TTS_CHAR_BUDGET && i > 0) break;
    used += l.text.length;
    cut = i + 1;
  }
  // always voice at least one line so a huge single line cannot stall the queue forever
  if (cut === 0 && lines.length) cut = 1;
  return { tonight: lines.slice(0, cut), later: lines.slice(cut) };
}

/** Every Aura-2 English speaker Workers AI accepts (Cloudflare model docs, 2026-10). */
export const AURA2_VOICES = [
  "amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena", "atlas", "aurora", "callista",
  "cora", "cordelia", "delia", "draco", "electra", "harmonia", "helena", "hera", "hermes", "hyperion",
  "iris", "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune", "odysseus", "ophelia",
  "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn", "thalia", "theia", "vesta", "zeus",
] as const;

/** Voices the owner picks in the Studio Voice Lab; stored in D1, read by the nightly voicer and the renderer. */
export interface VoiceSettings {
  ajjaVoice: string;
  kidVoice: string;
  /** browser resample rate: below 1 is deeper and slower, above 1 is higher and faster */
  ajjaPitch: number;
  kidPitch: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { ajjaVoice: AJJA_SPEAKER, kidVoice: KID_SPEAKER, ajjaPitch: AJJA_PITCH, kidPitch: KID_PITCH };

export const PITCH_MIN = 0.7;
export const PITCH_MAX = 1.5;

/** Validate a settings update; unknown voices or out-of-range pitches are rejected, missing fields keep the current value. */
export function mergeVoiceSettings(current: VoiceSettings, patch: Partial<Record<keyof VoiceSettings, unknown>>): { settings: VoiceSettings; errors: string[] } {
  const errors: string[] = [];
  const next = { ...current };
  for (const k of ["ajjaVoice", "kidVoice"] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (typeof v !== "string" || !(AURA2_VOICES as readonly string[]).includes(v)) errors.push(`${k} must be one of the Aura-2 voices`);
    else next[k] = v;
  }
  for (const k of ["ajjaPitch", "kidPitch"] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < PITCH_MIN || v > PITCH_MAX) errors.push(`${k} must be between ${PITCH_MIN} and ${PITCH_MAX}`);
    else next[k] = Math.round(v * 100) / 100;
  }
  return { settings: next, errors };
}

/** Which Aura voice speaks a line under the given settings. */
export const voiceFor = (speaker: DialogueLine["speaker"], s: VoiceSettings) => (speaker === "KID" ? s.kidVoice : s.ajjaVoice);
