import type { ClipPart, DialogueLine } from "./types.ts";

/** Aura-2 TTS: constant-bitrate mp3 maths, same approach as chota voice.ts. */
export const TTS_MODEL = "@cf/meta/llama-3.1-8b-instruct" as const; // placeholder, replaced by Aura speaker config in worker
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
