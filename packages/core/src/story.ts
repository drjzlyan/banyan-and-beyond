import type { DialogueLine, Speaker } from "./types.ts";

/** Max spoken lines per ~7.5-min chapter. Keeps TTS neuron budget predictable. */
export const MAX_LINES_PER_CHAPTER = 40;
export const MAX_WORDS_PER_LINE = 28;

/** Words that must never appear in a kids story (horror/violence/cynicism). */
const BANNED = [
  "ghost", "demon", "devil", "blood", "kill", "murder", "die", "death",
  "suicide", "hate", "stupid", "idiot", "hell", "curse", "witch",
  "gun", "knife", "bomb", "terror",
];

const LINE_RE = /^(AJJA|KID):\s*(.+)$/;

/** Parse "AJJA: ..." / "KID: ..." script body into lines. Returns nulls for bad rows. */
export function parseDialogue(spoken: string): (DialogueLine | null)[] {
  return spoken
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(LINE_RE);
      if (!m) return null;
      return { speaker: m[1] as Speaker, text: m[2].trim() };
    });
}

/**
 * Kids-safety + format validator (mirrors chota's number validator philosophy:
 * deterministic, strict, LLM output rejected on any problem).
 */
export function validateChapterBody(spoken: string | undefined | null): string[] {
  const problems: string[] = [];
  if (!spoken || !spoken.trim()) return ["script is empty"];
  const rows = spoken.split("\n").map((l) => l.trim()).filter(Boolean);
  if (rows.length < 6) problems.push("chapter needs at least 6 spoken lines");
  if (rows.length > MAX_LINES_PER_CHAPTER) problems.push(`chapter has ${rows.length} lines, max ${MAX_LINES_PER_CHAPTER}`);
  const parsed = parseDialogue(spoken);
  parsed.forEach((p, i) => {
    if (!p) { problems.push(`line ${i + 1} must start with AJJA: or KID:`); return; }
    const words = p.text.split(/\s+/).length;
    if (words > MAX_WORDS_PER_LINE) problems.push(`line ${i + 1} is too long (${words} words, max ${MAX_WORDS_PER_LINE})`);
    if (/[0-9]/.test(p.text)) problems.push(`line ${i + 1} must not contain digits (spell out small numbers or avoid them)`);
    const lower = p.text.toLowerCase();
    for (const b of BANNED) {
      if (lower.includes(b)) { problems.push(`line ${i + 1} contains a forbidden word ("${b}")`); break; }
    }
    if (/[<>]{1,}|http/i.test(p.text)) problems.push(`line ${i + 1} looks like markup or a link`);
  });
  const speakers = new Set(parsed.filter(Boolean).map((p) => (p as DialogueLine).speaker));
  if (!speakers.has("AJJA")) problems.push("Ajja must speak in every chapter");
  if (!speakers.has("KID")) problems.push("the Kid must ask or answer in every chapter");
  return problems;
}

/** Split a validated chapter body into dialogue lines (throws on invalid). */
export function splitDialogue(spoken: string): DialogueLine[] {
  const problems = validateChapterBody(spoken);
  if (problems.length) throw new Error(problems.join("; "));
  return parseDialogue(spoken).filter(Boolean) as DialogueLine[];
}
