import { SFX_IDS, MAX_SFX_PER_STORY, isSfxId, type SfxId } from "./sounds.ts";
import type { DialogueLine, Speaker } from "./types.ts";

export { SFX, SFX_IDS, type SfxId } from "./sounds.ts";

/** Max spoken lines per story (~7 min of short lines + intro/outro). Keeps the TTS neuron budget predictable. */
export const MAX_LINES_PER_CHAPTER = 140;
/** Short lines are easier for six-year-olds to follow (the prompt asks for 4-14 words). */
export const MAX_WORDS_PER_LINE = 20;
export const MAX_SFX_PER_CHAPTER = MAX_SFX_PER_STORY;

/** Words that must never appear in a kids story (horror/violence/cynicism). */
const BANNED = [
  "ghost", "demon", "devil", "blood", "kill", "murder", "die", "dead", "death",
  "suicide", "hate", "stupid", "idiot", "hell", "curse", "witch", "monster",
  "gun", "knife", "bomb", "terror",
];
/** Whole words plus simple endings, so "hello", "skill", "switch" and "studied" are allowed. */
const BANNED_RE = new RegExp(`\\b(${BANNED.join("|")})(s|es|d|ed|ing|er|ers|ly)?\\b`, "i");
export const hasBannedWord = (t: string) => BANNED_RE.exec(t)?.[0].toLowerCase() ?? null;

/** Speaker tags: AJJA (narrator), KID (listener under the tree) or a story character's id (MEENA). */
const LINE_RE = /^([A-Z][A-Z_]{1,15}):\s*(.+)$/;
const SFX_RE = /^SFX:\s*([a-z-]+)\s*$/i;
const SCENE_RE = /^SCENE:\s*(\d+)\s*$/i;

export type ScriptItem =
  | { kind: "line"; speaker: Speaker; text: string }
  | { kind: "sfx"; id: string }
  | { kind: "scene"; n: number };

/** Parse a script body into dialogue lines, sound cues and scene marks, in order. Null for rows that are none of these. */
export function parseScript(spoken: string): (ScriptItem | null)[] {
  return spoken
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((row): ScriptItem | null => {
      const sc = row.match(SCENE_RE);
      if (sc) return { kind: "scene", n: Number(sc[1]) };
      const s = row.match(SFX_RE);
      if (s) return { kind: "sfx", id: s[1].toLowerCase() };
      const m = row.match(LINE_RE);
      return m && m[1] !== "SFX" && m[1] !== "SCENE" ? { kind: "line", speaker: m[1] as Speaker, text: m[2].trim() } : null;
    });
}

/** Dialogue lines only (cues and scene marks are never spoken). Returns nulls for bad rows. */
export function parseDialogue(spoken: string): (DialogueLine | null)[] {
  return parseScript(spoken)
    .filter((it) => it?.kind !== "sfx" && it?.kind !== "scene")
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
    else if (it.kind === "sfx" && isSfxId(it.id)) out.push({ id: it.id, before: n });
  }
  return out;
}

/** Scene marks keyed the same way: scene n (1-based, from the story plan) starts before dialogue line `before`. */
export function sceneMarks(spoken: string): { n: number; before: number }[] {
  const out: { n: number; before: number }[] = [];
  let n = 0;
  for (const it of parseScript(spoken ?? "")) {
    if (!it) continue;
    if (it.kind === "line") n++;
    else if (it.kind === "scene") out.push({ n: it.n, before: n });
  }
  return out;
}

/**
 * Kids-safety + format validator (deterministic, strict, LLM output rejected on any problem).
 * `speakers` lists the story's allowed speaker tags; without it, only AJJA and KID are allowed.
 */
export function validateChapterBody(spoken: string | undefined | null, opts: { speakers?: string[] } = {}): string[] {
  const problems: string[] = [];
  if (!spoken || !spoken.trim()) return ["script is empty"];
  const allowed = new Set(["AJJA", "KID", ...(opts.speakers ?? [])]);
  const items = parseScript(spoken);
  const lines = items.filter((it) => it?.kind !== "sfx" && it?.kind !== "scene");
  const cues = items.filter((it) => it?.kind === "sfx") as { kind: "sfx"; id: string }[];
  if (lines.length < 6) problems.push("needs at least 6 spoken lines");
  if (lines.length > MAX_LINES_PER_CHAPTER) problems.push(`has ${lines.length} lines, max ${MAX_LINES_PER_CHAPTER}`);
  if (cues.length > MAX_SFX_PER_CHAPTER) problems.push(`has ${cues.length} sound cues, max ${MAX_SFX_PER_CHAPTER}`);
  for (const c of cues) {
    if (!(SFX_IDS as string[]).includes(c.id)) { problems.push(`unknown sound "${c.id}"; use only: ${SFX_IDS.join(", ")}`); break; }
  }
  items.forEach((it, i) => {
    if (!it) { problems.push(`row ${i + 1} must start with a speaker tag (${[...allowed].join(", ")}), SFX: or SCENE:`); return; }
    if (it.kind === "scene") return;
    if (it.kind === "sfx") {
      if (items[i - 1]?.kind === "sfx") problems.push(`row ${i + 1}: two sound cues in a row`);
      return;
    }
    if (!allowed.has(it.speaker)) problems.push(`row ${i + 1}: unknown speaker ${it.speaker}; use only ${[...allowed].join(", ")}`);
    const words = it.text.split(/\s+/).length;
    if (words > MAX_WORDS_PER_LINE) problems.push(`row ${i + 1} is too long (${words} words, max ${MAX_WORDS_PER_LINE}); split it into two lines`);
    if (/[0-9]/.test(it.text)) problems.push(`row ${i + 1} must not contain digits (spell out small numbers or avoid them)`);
    const banned = hasBannedWord(it.text);
    if (banned) problems.push(`row ${i + 1} contains a forbidden word ("${banned}")`);
    if (/[<>]{1,}|http/i.test(it.text)) problems.push(`row ${i + 1} looks like markup or a link`);
  });
  const speakers = new Set(lines.filter(Boolean).map((p) => (p as { speaker: Speaker }).speaker));
  if (!speakers.has("AJJA")) problems.push("Ajja must speak");
  if (!speakers.has("KID")) problems.push("the Kid must ask or answer");
  return problems;
}

/* ---------- story-quality checks (the live failures of 2026-10-20, caught in code) ---------- */

const STOP = new Set("a an the and or but so to of in on at for with from by is was were be been it its he she they we you i me my his her their our your this that then there here as up down out into over very too just not no yes all one two oh ah".split(" "));
const contentWords = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** The Kid sits under the banyan and listens; she must never narrate the story's events as if she was there. */
const KID_NARRATES = /\b(I|we)\s+(tried|ran|climbed|fell|caught|slipped|picked|grabbed|took|went|pulled|jumped|found|opened|carried|walked|threw|gave|tugged|lifted|reached)\b/i;
/** Abstract comparisons little kids can't picture ("honesty shines like sunshine"). */
const METAPHOR = /\b(honesty|kindness|truth|courage|respect|sharing|gratitude|duty|trust|love|friendship|goodness|kind hearts?|hope)\b[^.!?]{0,30}?\b(like|as \w+ as)\b|\blike sunshine\b|\blike a golden\b/i;
/** Ajja's question to the children watching. */
export const isViewerQuestion = (l: { speaker: string; text: string }) => l.speaker === "AJJA" && (/\bYOU\b/.test(l.text) || /\bhmm\b[?.!]*\s*$/i.test(l.text));

/**
 * Story-level checks on the joined script: repeated lines (the model replaying a beat), the Kid
 * narrating events, too many questions to the viewers, abstract metaphors. `chorus` is the
 * story's planned catchphrase, which may repeat.
 */
export function storyProblems(lines: { speaker: string; text: string }[], opts: { chorus?: string; maxViewerQuestions?: number } = {}): string[] {
  const problems: string[] = [];
  const chorus = opts.chorus ? new Set(contentWords(opts.chorus)) : null;
  const isChorus = (w: string[]) => !!chorus && chorus.size > 0 && w.filter((x) => chorus.has(x)).length >= Math.ceil(chorus.size * 0.6);
  const seen: { i: number; words: Set<string> }[] = [];
  lines.forEach((l, i) => {
    const w = contentWords(l.text);
    // the catchphrase and Ajja's question to the viewers are meant to come back
    if (w.length >= 3 && !isChorus(w) && !isViewerQuestion(l)) {
      const set = new Set(w);
      const twin = seen.find((s) => {
        const inter = [...set].filter((x) => s.words.has(x)).length;
        return inter / Math.min(set.size, s.words.size) >= 0.75 && inter >= 3;
      });
      if (twin) problems.push(`line ${i + 1} repeats line ${twin.i + 1} ("${l.text.slice(0, 50)}"); move the story forward instead`);
      seen.push({ i, words: set });
    }
    if (l.speaker === "KID" && KID_NARRATES.test(l.text)) problems.push(`line ${i + 1}: the Kid is listening under the banyan tree, not inside the story; she can guess, ask or react, but never say "I ${l.text.match(KID_NARRATES)?.[2]}"`);
    if (METAPHOR.test(l.text)) problems.push(`line ${i + 1} uses an abstract comparison ("${l.text.match(METAPHOR)?.[0]}"); say what someone did instead`);
  });
  const questions = lines.filter(isViewerQuestion).length;
  const max = opts.maxViewerQuestions ?? 3;
  if (questions > max) problems.push(`Ajja asks the viewers ${questions} times; at most ${max} in the whole story`);
  return problems;
}

/** Stage directions TTS would read aloud: "*whistles*", "(laughs)", "[giggles]". */
export const stripStageDirections = (t: string) => t.replace(/\s*(\*[^*]{1,40}\*|\([^)]{1,40}\)|\[[^\]]{1,40}\])\s*/g, " ").replace(/\s{2,}/g, " ").trim();

/** Typographic characters can trip up TTS and fonts, so normalize to plain ASCII. */
export const asciiPunct = (t: string) =>
  t.replace(/\s*[–—―]\s*/g, ", ").replace(/[‐‑‒−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/ /g, " ");

/** Split a validated script into dialogue lines (throws on invalid). Cues and scene marks are dropped. */
export function splitDialogue(spoken: string, opts: { speakers?: string[] } = {}): DialogueLine[] {
  const problems = validateChapterBody(spoken, opts);
  if (problems.length) throw new Error(problems.join("; "));
  return parseDialogue(spoken).filter(Boolean) as DialogueLine[];
}
