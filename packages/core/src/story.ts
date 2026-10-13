import type { DialogueLine, Speaker } from "./types.ts";

/** Max spoken lines per ~6-min chapter (up to 4 parts of up to 30 short lines + intro/outro). Keeps TTS neuron budget predictable. */
export const MAX_LINES_PER_CHAPTER = 122;
/** Short lines are easier for six-year-olds to follow (the prompt asks for 6-14 words). */
export const MAX_WORDS_PER_LINE = 20;
export const MAX_SFX_PER_CHAPTER = 24;

/**
 * Sound effects the browser synthesizes at render time (no TTS, no neurons). The model may only
 * cue these ids; each also drives a matching animation in the video.
 */
export const SFX = {
  birds: "birds chirping in the tree",
  wind: "a soft breeze through the leaves",
  rain: "gentle rain pattering",
  river: "a stream of water flowing",
  bell: "a temple bell ringing",
  crickets: "crickets at night",
  footsteps: "small footsteps walking",
  drum: "a happy dholak drum beat",
  flute: "a short flute tune",
  chime: "a twinkly magic chime for happy surprises",
  splash: "a playful water splash",
  knock: "a knock on a wooden door",
} as const;
export type SfxId = keyof typeof SFX;
export const SFX_IDS = Object.keys(SFX) as SfxId[];

/** Words that must never appear in a kids story (horror/violence/cynicism). */
const BANNED = [
  "ghost", "demon", "devil", "blood", "kill", "murder", "die", "dead", "death",
  "suicide", "hate", "stupid", "idiot", "hell", "curse", "witch",
  "gun", "knife", "bomb", "terror",
];
/** Whole words plus simple endings, so "hello", "skill", "switch" and "studied" are allowed. */
const BANNED_RE = new RegExp(`\\b(${BANNED.join("|")})(s|es|d|ed|ing|er|ers|ly)?\\b`, "i");

const LINE_RE = /^(AJJA|KID):\s*(.+)$/;
const SFX_RE = /^SFX:\s*([a-z]+)\s*$/i;

export type ScriptItem = { kind: "line"; speaker: Speaker; text: string } | { kind: "sfx"; id: string };

/** Parse a script body into dialogue lines and sound cues, in order. Returns null for rows that are neither. */
export function parseScript(spoken: string): (ScriptItem | null)[] {
  return spoken
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((row): ScriptItem | null => {
      const s = row.match(SFX_RE);
      if (s) return { kind: "sfx", id: s[1].toLowerCase() };
      const m = row.match(LINE_RE);
      return m ? { kind: "line", speaker: m[1] as Speaker, text: m[2].trim() } : null;
    });
}

/** Dialogue lines only (sound cues are skipped; they are never spoken). Returns nulls for bad rows. */
export function parseDialogue(spoken: string): (DialogueLine | null)[] {
  return parseScript(spoken)
    .filter((it) => it?.kind !== "sfx")
    .map((it) => (it && it.kind === "line" ? { speaker: it.speaker, text: it.text } : null));
}

/**
 * Sound cues keyed by the dialogue line they come before: cue.before = index of the next spoken
 * line (= number of dialogue lines before the cue). A cue after the last line has before = lines.length.
 */
export function sfxCues(spoken: string): { id: SfxId; before: number }[] {
  const out: { id: SfxId; before: number }[] = [];
  let n = 0;
  for (const it of parseScript(spoken ?? "")) {
    if (!it) continue;
    if (it.kind === "line") n++;
    else if ((SFX_IDS as string[]).includes(it.id)) out.push({ id: it.id as SfxId, before: n });
  }
  return out;
}

/**
 * Kids-safety + format validator (mirrors chota's number validator philosophy:
 * deterministic, strict, LLM output rejected on any problem).
 */
export function validateChapterBody(spoken: string | undefined | null): string[] {
  const problems: string[] = [];
  if (!spoken || !spoken.trim()) return ["script is empty"];
  const items = parseScript(spoken);
  const lines = items.filter((it) => it?.kind !== "sfx");
  const cues = items.filter((it) => it?.kind === "sfx") as { kind: "sfx"; id: string }[];
  if (lines.length < 6) problems.push("chapter needs at least 6 spoken lines");
  if (lines.length > MAX_LINES_PER_CHAPTER) problems.push(`chapter has ${lines.length} lines, max ${MAX_LINES_PER_CHAPTER}`);
  if (cues.length > MAX_SFX_PER_CHAPTER) problems.push(`chapter has ${cues.length} sound cues, max ${MAX_SFX_PER_CHAPTER}`);
  for (const c of cues) {
    if (!(SFX_IDS as string[]).includes(c.id)) { problems.push(`unknown sound "${c.id}"; use only: ${SFX_IDS.join(", ")}`); break; }
  }
  items.forEach((it, i) => {
    if (!it) { problems.push(`line ${i + 1} must start with AJJA:, KID: or SFX:`); return; }
    if (it.kind === "sfx") {
      if (items[i - 1]?.kind === "sfx") problems.push(`line ${i + 1}: two sound cues in a row`);
      return;
    }
    const words = it.text.split(/\s+/).length;
    if (words > MAX_WORDS_PER_LINE) problems.push(`line ${i + 1} is too long (${words} words, max ${MAX_WORDS_PER_LINE}); split it into two lines`);
    if (/[0-9]/.test(it.text)) problems.push(`line ${i + 1} must not contain digits (spell out small numbers or avoid them)`);
    const banned = it.text.match(BANNED_RE);
    if (banned) problems.push(`line ${i + 1} contains a forbidden word ("${banned[0].toLowerCase()}")`);
    if (/[<>]{1,}|http/i.test(it.text)) problems.push(`line ${i + 1} looks like markup or a link`);
  });
  const speakers = new Set(lines.filter(Boolean).map((p) => (p as { speaker: Speaker }).speaker));
  if (!speakers.has("AJJA")) problems.push("Ajja must speak in every chapter");
  if (!speakers.has("KID")) problems.push("the Kid must ask or answer in every chapter");
  return problems;
}

/** Typographic characters can trip up TTS and fonts, so normalize to plain ASCII. */
export const asciiPunct = (t: string) =>
  t.replace(/\s*[–—―]\s*/g, ", ").replace(/[‐‑‒−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/ /g, " ");

/** Split a validated chapter body into dialogue lines (throws on invalid). Sound cues are dropped. */
export function splitDialogue(spoken: string): DialogueLine[] {
  const problems = validateChapterBody(spoken);
  if (problems.length) throw new Error(problems.join("; "));
  return parseDialogue(spoken).filter(Boolean) as DialogueLine[];
}
