import { NIGHTLY_TTS_CHAR_BUDGET } from "./voices.ts";
import { INTRO_LINE } from "./selection.ts";
import { SFX } from "./sounds.ts";
import { isViewerQuestion, parseDialogue, sfxCues, storyProblems, validateChapterBody } from "./story.ts";
import { totalPauses } from "./timeline.ts";

/** Target length of one standalone story video: ~7 min, in a 6-8 min window (owner's choice, 2026-10-22). */
export const TARGET_CHAPTER_SECONDS = 420;
export const TARGET_EPISODE_SECONDS = TARGET_CHAPTER_SECONDS;
/** Extra room the renderer leaves for each "beat" sound cue before its line (overlays get none). */
export const SFX_GAP_SECONDS = 1.2;
/** Aura-2 reads these stories at roughly this pace (measured live: 620 words in 233 s). */
export const SPOKEN_WORDS_PER_SECOND = 2.65;

export interface ChapterAnalysis {
  lines: number;
  ajjaLines: number;
  kidLines: number;
  /** lines spoken by the story's characters (their own voices) */
  castLines: number;
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
  opts: {
    clipDurations?: { speaker: string; duration: number; pitch?: number }[]; ajjaPitch?: number; kidPitch?: number; finalChapter?: boolean;
    /** the story's character ids (allowed speakers), its catchphrase, and each character's pitch */
    speakers?: string[]; chorus?: string; castPitch?: Record<string, number>;
  } = {},
): ChapterAnalysis {
  const parsed = parseDialogue(spoken ?? "").filter(Boolean) as { speaker: string; text: string }[];
  const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const ajja = parsed.filter((l) => l.speaker === "AJJA");
  const kid = parsed.filter((l) => l.speaker === "KID");
  const words = parsed.reduce((n, l) => n + wc(l.text), 0);
  const ttsChars = parsed.reduce((n, l) => n + l.text.length, 0);
  const clips = opts.clipDurations ?? [];
  const voiced = clips.length > 0 && clips.length >= parsed.length;
  const cues = sfxCues(spoken ?? "");
  // only "beat" sounds get a gap of their own; overlays play under the voice on their word
  const gap = totalPauses(parsed) + cues.filter((c) => SFX[c.id].kind === "beat").length * SFX_GAP_SECONDS;
  const seconds = voiced ? clips.reduce((n, c) => n + c.duration, 0) + gap : words / SPOKEN_WORDS_PER_SECOND + gap;
  const pitchOf = (speaker: string, stored?: number) =>
    speaker === "KID" ? (opts.kidPitch ?? 1) : speaker === "AJJA" ? (opts.ajjaPitch ?? 1) : (stored ?? opts.castPitch?.[speaker] ?? 1);
  const pitchedSeconds = voiced
    ? clips.reduce((n, c) => n + c.duration / pitchOf(c.speaker, c.pitch), 0) + gap
    : parsed.reduce((n, l) => n + wc(l.text) / SPOKEN_WORDS_PER_SECOND / pitchOf(l.speaker), 0) + gap;
  const hookLines = parsed.flatMap((l, i) => (/\btomorrow\b/i.test(l.text) ? [i + 1] : []));
  const craft = parsed.length ? storyCraft(parsed, !!opts.finalChapter, { chorus: opts.chorus, cast: opts.speakers }) : [];
  const problems = spoken?.trim() ? validateChapterBody(spoken, { speakers: opts.speakers }) : ["no script yet"];
  const warnings: string[] = [];
  if (parsed.length) {
    if (pitchedSeconds < TARGET_CHAPTER_SECONDS * 0.8) warnings.push(`runs about ${Math.round(pitchedSeconds / 60 * 10) / 10} min; the plan is about ${TARGET_CHAPTER_SECONDS / 60} min`);
    if (opts.speakers) for (const p of storyProblems(parsed, { chorus: opts.chorus })) warnings.push(p);
    if (!opts.finalChapter && hookLines.length) warnings.push(`"tomorrow" on line ${hookLines.join(", ")}: the chapters play back to back in one video, so end on a cliffhanger ("And then... guess what?") instead`);
    for (const c of craft) if (!c.ok) warnings.push(`storytelling: no ${c.label.toLowerCase()} (${c.hint})`);
    if (kid.length < 3) warnings.push("the Kid speaks fewer than three times");
    const avg = words / parsed.length;
    if (avg > 15) warnings.push(`lines average ${avg.toFixed(1)} words; short lines (6 to 14 words) are easier for young kids`);
    if (cues.length === 0) warnings.push("no sound cues; new scripts get them from the words (splash, knock, giggled...)");
    for (let i = 1; i < parsed.length; i++) if (parsed[i].speaker === "KID" && parsed[i - 1].speaker === "KID") { warnings.push(`two Kid lines in a row at line ${i + 1}`); break; }
  }
  return {
    lines: parsed.length, ajjaLines: ajja.length, kidLines: kid.length, castLines: parsed.length - ajja.length - kid.length, words,
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

/** The storytelling techniques the story prompt asks for, checked with simple text rules. */
export function storyCraft(
  lines: { speaker: string; text: string }[], finalChapter: boolean, opts: { chorus?: string; cast?: string[] } = {},
): { label: string; ok: boolean; hint: string }[] {
  const story = lines.filter((l) => l.text !== INTRO_LINE);
  const opening = story.slice(0, 3);
  const words = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  const trigrams = new Map<string, Set<number>>();
  story.forEach((l, i) => { const w = words(l.text); for (let j = 0; j + 2 < w.length; j++) { const k = w.slice(j, j + 3).join(" "); if (!trigrams.has(k)) trigrams.set(k, new Set()); trigrams.get(k)!.add(i); } });
  const chorusSaid = opts.chorus
    ? story.filter((l) => l.text.toLowerCase().includes(opts.chorus!.toLowerCase().replace(/[.!?]+$/, ""))).length >= 2
    : [...trigrams.values()].some((s) => s.size >= 2);
  const questions = lines.filter(isViewerQuestion).length;
  const last = story[story.length - 1]?.text ?? "";
  const checks = [
    { label: "Opening hook", ok: opening.some((l) => /[!?]\s*$|\.\.\./.test(l.text) || SOUND_WORD.test(l.text)), hint: "the first lines should surprise: a sound, a question or a 'guess what'" },
    { label: "Question to viewers", ok: questions >= 1 && questions <= 3, hint: "Ajja asks the children watching 'What would YOU do? Hmm?' once or twice (not more)" },
    { label: "Repeated chorus", ok: chorusSaid, hint: "one little catchy phrase said two or three times" },
    { label: "Feelings", ok: lines.filter((l) => FEELING.test(l.text)).length >= 2, hint: "say how the characters feel" },
    { label: "Kid guesses", ok: lines.some((l) => l.speaker === "KID" && GUESS.test(l.text)), hint: "the Kid guesses what happens next, sometimes wrong" },
  ];
  if (opts.cast) {
    checks.push({ label: "Characters talk", ok: lines.filter((l) => opts.cast!.includes(l.speaker)).length >= 8, hint: "the story's characters say their own lines, not only Ajja" });
    checks.push({ label: "No replays", ok: storyProblems(lines, { chorus: opts.chorus }).length === 0, hint: "no repeated events, the Kid only listens, no abstract comparisons" });
  }
  if (!finalChapter) checks.push({ label: "Cliffhanger ending", ok: /\?\s*$|\.\.\.\s*$|\bguess what\b|\bwhat happened next\b|\band then\b/i.test(last), hint: "end on a question or 'And then... guess what?'" });
  return checks;
}
