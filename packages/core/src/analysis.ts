import { NIGHTLY_TTS_CHAR_BUDGET } from "./voices.ts";
import { parseDialogue, validateChapterBody } from "./story.ts";

/** Target length of one chapter (8 chapters ≈ 1 hour). */
export const TARGET_CHAPTER_SECONDS = 450;
/** Aura-2 reads these stories at roughly this pace (measured live: 620 words in 233 s). */
export const SPOKEN_WORDS_PER_SECOND = 2.65;

export interface ChapterAnalysis {
  lines: number;
  ajjaLines: number;
  kidLines: number;
  words: number;
  ajjaWords: number;
  kidWords: number;
  /** characters sent to TTS (what the nightly neuron budget is counted in) */
  ttsChars: number;
  /** voiced length if clips exist, else estimated from words */
  seconds: number;
  secondsEstimated: boolean;
  /** seconds after the per-speaker pitch resample (rate < 1 stretches) */
  pitchedSeconds: number;
  longestLineWords: number;
  /** lines promising "tomorrow" — a chapter should end with exactly one hook */
  hookLines: number[];
  nightsToVoice: number;
  problems: string[];
  warnings: string[];
}

/** Pure chapter health check for the Studio: length, balance, budget, and story-shape warnings. */
export function analyzeChapter(
  spoken: string,
  opts: { clipDurations?: { speaker: string; duration: number }[]; ajjaPitch?: number; kidPitch?: number; finalChapter?: boolean } = {},
): ChapterAnalysis {
  const parsed = parseDialogue(spoken ?? "").filter(Boolean) as { speaker: "AJJA" | "KID"; text: string }[];
  const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const ajja = parsed.filter((l) => l.speaker === "AJJA");
  const kid = parsed.filter((l) => l.speaker === "KID");
  const words = parsed.reduce((n, l) => n + wc(l.text), 0);
  const ttsChars = parsed.reduce((n, l) => n + l.text.length, 0);
  const clips = opts.clipDurations ?? [];
  const voiced = clips.length > 0 && clips.length >= parsed.length;
  const gap = 0.35 * Math.max(0, parsed.length - 1);
  const seconds = voiced ? clips.reduce((n, c) => n + c.duration, 0) + gap : words / SPOKEN_WORDS_PER_SECOND + gap;
  const aP = opts.ajjaPitch ?? 1;
  const kP = opts.kidPitch ?? 1;
  const pitchedSeconds = voiced
    ? clips.reduce((n, c) => n + c.duration / (c.speaker === "KID" ? kP : aP), 0) + gap
    : ajja.reduce((n, l) => n + wc(l.text), 0) / SPOKEN_WORDS_PER_SECOND / aP + kid.reduce((n, l) => n + wc(l.text), 0) / SPOKEN_WORDS_PER_SECOND / kP + gap;
  const hookLines = parsed.flatMap((l, i) => (/\btomorrow\b/i.test(l.text) ? [i + 1] : []));
  const problems = spoken?.trim() ? validateChapterBody(spoken) : ["no script yet"];
  const warnings: string[] = [];
  if (parsed.length) {
    if (pitchedSeconds < TARGET_CHAPTER_SECONDS * 0.8) warnings.push(`runs about ${Math.round(pitchedSeconds / 60 * 10) / 10} min; the 1-hour plan needs about ${TARGET_CHAPTER_SECONDS / 60} min per chapter`);
    if (!opts.finalChapter && hookLines.length > 1) warnings.push(`${hookLines.length} "tomorrow" hooks (lines ${hookLines.join(", ")}); there should be one, at the end`);
    if (!opts.finalChapter && hookLines.length && hookLines[hookLines.length - 1] < parsed.length - 2) warnings.push(`the story keeps going after the "tomorrow" hook on line ${hookLines[hookLines.length - 1]}`);
    if (kid.length < 3) warnings.push("the Kid speaks fewer than three times");
    for (let i = 1; i < parsed.length; i++) if (parsed[i].speaker === "KID" && parsed[i - 1].speaker === "KID") { warnings.push(`two Kid lines in a row at line ${i + 1}`); break; }
  }
  return {
    lines: parsed.length, ajjaLines: ajja.length, kidLines: kid.length, words,
    ajjaWords: ajja.reduce((n, l) => n + wc(l.text), 0), kidWords: kid.reduce((n, l) => n + wc(l.text), 0),
    ttsChars, seconds, secondsEstimated: !voiced, pitchedSeconds,
    longestLineWords: parsed.reduce((m, l) => Math.max(m, wc(l.text)), 0),
    hookLines, nightsToVoice: Math.ceil(ttsChars / NIGHTLY_TTS_CHAR_BUDGET), problems, warnings,
  };
}
