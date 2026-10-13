import { NIGHTLY_TTS_CHAR_BUDGET } from "./voices.ts";
import { INTRO_LINE } from "./selection.ts";
import { parseDialogue, sfxCues, validateChapterBody } from "./story.ts";
import { totalPauses } from "./timeline.ts";

/** Target length of one chapter: ~6 min, so 8 chapters ≈ 48 min (owner's choice, 2026-10-13). */
export const TARGET_CHAPTER_SECONDS = 360;
export const TARGET_EPISODE_SECONDS = TARGET_CHAPTER_SECONDS * 8;
/** Extra room the renderer leaves for each sound cue before the next line (keep in sync with the Studio's SFX_GAP). */
export const SFX_GAP_SECONDS = 1.2;
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
  avgLineWords: number;
  sfx: number;
  /** lines saying "tomorrow": wrong mid-episode, since the chapters play back to back in one video */
  hookLines: number[];
  /** storytelling checklist the prompt asks for, so the owner can see if the model followed it */
  craft: { label: string; ok: boolean; hint: string }[];
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
  const cues = sfxCues(spoken ?? "");
  const gap = totalPauses(parsed) + cues.length * SFX_GAP_SECONDS;
  const seconds = voiced ? clips.reduce((n, c) => n + c.duration, 0) + gap : words / SPOKEN_WORDS_PER_SECOND + gap;
  const aP = opts.ajjaPitch ?? 1;
  const kP = opts.kidPitch ?? 1;
  const pitchedSeconds = voiced
    ? clips.reduce((n, c) => n + c.duration / (c.speaker === "KID" ? kP : aP), 0) + gap
    : ajja.reduce((n, l) => n + wc(l.text), 0) / SPOKEN_WORDS_PER_SECOND / aP + kid.reduce((n, l) => n + wc(l.text), 0) / SPOKEN_WORDS_PER_SECOND / kP + gap;
  const hookLines = parsed.flatMap((l, i) => (/\btomorrow\b/i.test(l.text) ? [i + 1] : []));
  const craft = parsed.length ? storyCraft(parsed, !!opts.finalChapter) : [];
  const problems = spoken?.trim() ? validateChapterBody(spoken) : ["no script yet"];
  const warnings: string[] = [];
  if (parsed.length) {
    if (pitchedSeconds < TARGET_CHAPTER_SECONDS * 0.8) warnings.push(`runs about ${Math.round(pitchedSeconds / 60 * 10) / 10} min; the plan is about ${TARGET_CHAPTER_SECONDS / 60} min per chapter`);
    if (!opts.finalChapter && hookLines.length) warnings.push(`"tomorrow" on line ${hookLines.join(", ")}: the chapters play back to back in one video, so end on a cliffhanger ("And then... guess what?") instead`);
    for (const c of craft) if (!c.ok) warnings.push(`storytelling: no ${c.label.toLowerCase()} (${c.hint})`);
    if (kid.length < 3) warnings.push("the Kid speaks fewer than three times");
    const avg = words / parsed.length;
    if (avg > 15) warnings.push(`lines average ${avg.toFixed(1)} words; short lines (6 to 14 words) are easier for young kids`);
    if (cues.length === 0) warnings.push("no sound cues; new scripts add three to five per part");
    for (let i = 1; i < parsed.length; i++) if (parsed[i].speaker === "KID" && parsed[i - 1].speaker === "KID") { warnings.push(`two Kid lines in a row at line ${i + 1}`); break; }
  }
  return {
    lines: parsed.length, ajjaLines: ajja.length, kidLines: kid.length, words,
    ajjaWords: ajja.reduce((n, l) => n + wc(l.text), 0), kidWords: kid.reduce((n, l) => n + wc(l.text), 0),
    ttsChars, seconds, secondsEstimated: !voiced, pitchedSeconds,
    longestLineWords: parsed.reduce((m, l) => Math.max(m, wc(l.text)), 0),
    avgLineWords: parsed.length ? words / parsed.length : 0, sfx: cues.length,
    hookLines, craft, nightsToVoice: Math.ceil(ttsChars / NIGHTLY_TTS_CHAR_BUDGET), problems, warnings,
  };
}

const SOUND_WORD = /\b(whoosh|ding|dong|splash|splish|tap|moo|knock|boom|crash|swish|thud|pop|buzz|tweet|chirp|clap|zoom|plop)\b/i;
const FEELING = /\b(happy|sad|worried|excited|proud|shy|surprised|nervous|glad|sorry|smiled|giggled|grinned|frowned|sighed|cried|scared|lonely|brave|felt)\b/i;
const GUESS = /\b(i think|maybe|is it|was it|i know|i bet|i guess)\b/i;

/** The storytelling techniques the script prompt asks for, checked with simple text rules. */
export function storyCraft(lines: { speaker: string; text: string }[], finalChapter: boolean): { label: string; ok: boolean; hint: string }[] {
  const story = lines.filter((l) => l.text !== INTRO_LINE);
  const opening = story.slice(0, 3);
  const words = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  const trigrams = new Map<string, Set<number>>();
  story.forEach((l, i) => { const w = words(l.text); for (let j = 0; j + 2 < w.length; j++) { const k = w.slice(j, j + 3).join(" "); if (!trigrams.has(k)) trigrams.set(k, new Set()); trigrams.get(k)!.add(i); } });
  const chorus = [...trigrams.values()].some((s) => s.size >= 2);
  const last = story[story.length - 1]?.text ?? "";
  const checks = [
    { label: "Opening hook", ok: opening.some((l) => /[!?]\s*$|\.\.\./.test(l.text) || SOUND_WORD.test(l.text)), hint: "the first lines should surprise: a sound, a question or a 'guess what'" },
    { label: "Question to viewers", ok: lines.some((l) => l.speaker === "AJJA" && (/\bYOU\b/.test(l.text) || /\bhmm\b/i.test(l.text))), hint: "Ajja asks the children watching 'What would YOU do? Hmm?'" },
    { label: "Repeated chorus", ok: chorus, hint: "one little catchy phrase said two or three times" },
    { label: "Feelings", ok: lines.filter((l) => FEELING.test(l.text)).length >= 2, hint: "say how the characters feel" },
    { label: "Kid guesses", ok: lines.some((l) => l.speaker === "KID" && GUESS.test(l.text)), hint: "the Kid guesses what happens next, sometimes wrong" },
  ];
  if (!finalChapter) checks.push({ label: "Cliffhanger ending", ok: /\?\s*$|\.\.\.\s*$|\bguess what\b|\bwhat happened next\b|\band then\b/i.test(last), hint: "end on a question or 'And then... guess what?'" });
  return checks;
}

