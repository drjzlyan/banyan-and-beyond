import { type AiRunner, STORY_MODEL, STORY_MODEL_FALLBACK, extractAiText } from "./ai.ts";
import { INTRO_LINE, OUTRO_LINE } from "./selection.ts";
import { asciiPunct, splitDialogue, validateChapterBody } from "./story.ts";
import type { DialogueLine, EpisodeOutline } from "./types.ts";

/** Target spoken length per ~7.5-min chapter (TTS + breath pauses land near 7 minutes). */
export const MIN_CHAPTER_WORDS = 550;
export const MAX_CHAPTER_WORDS = 800;

const SYSTEM = `You are Ajja, a warm Indian grandfather telling bedtime-style stories under the old banyan tree to his curious eight-year-old grandchild. Your stories quietly teach good behaviour: honesty, kindness, duty, courage, respect, sharing, cleanliness, gratitude. You love old traditions and speak of elders and festivals with fondness, and you are equally kind to every person in the village no matter who they are. You never preach and never scold; the lesson blooms out of the story itself.
Voice: gentle, unhurried, simple words a six-year-old understands. Short sentences. The Kid interrupts with innocent questions ("But Ajja, why...?", "What happened then?"), and you answer with patience and a smile in your voice. A little humour through the Kid's misunderstandings, never meanness.
Output ONLY a JSON object: {"lines": string[]} where every string starts with "AJJA: " or "KID: ".
Rules:
- Length is critical: write 14 to 20 lines and about 300 words. Count your lines before answering; anything under 12 lines will be rejected and you will have to redo it.
- Ajja speaks most lines; the Kid speaks at least 3 lines. Never two Kid lines in a row.
- HARD LIMIT: no single line may exceed 25 words; keep most lines under 20 words. If a thought is long, split it into two lines (Ajja, then the Kid reacting, then Ajja continuing).
- Every line is one or two FULL sentences of 12 to 22 words — rich enough to paint a picture, simple enough for a six-year-old. Never a three-word line.
- NEVER write digits. Spell out tiny counts if you must ("two mangoes"), better to avoid counts at all.
- Never use frightening, violent or mean words. Nobody dies, nobody is hurt, no ghosts or monsters.
- Stay inside this chapter's beat. Do not finish the whole story and do not reveal the final moral in words; let events hint at it.
- Do not mention chapters, episodes, YouTube, or that you are an AI.`;

export function buildChapterMessages(outline: EpisodeOutline, chapterIndex: number, feedback?: string[], priorLines?: string[]) {
  const ch = outline.chapters[chapterIndex];
  // Ajja's welcome line is prepended by code, so the model must not welcome the children again.
  const prev = chapterIndex > 0 ? `Previous chapter ended with: ${outline.chapters[chapterIndex - 1].beat}` : `This is the opening chapter. Ajja has ALREADY greeted the children (that line is added for you), so do not welcome or greet them again; go straight into the story.`;
  const secondHalf = !!priorLines?.length;
  // The hook belongs at the very end of the chapter only. Telling both halves to end on a
  // hook produced two "tomorrow" promises mid-chapter (seen live in episode 1, chapter 1).
  const ending = chapterIndex === 7
    ? (secondHalf
      ? `This is the closing chapter: gather everyone warmly and end with a soft bedtime farewell. Do NOT state the moral as a lesson sentence; show it in what happens.`
      : `This is the closing chapter, but this is only its first half: do not say goodbye yet.`)
    : (secondHalf
      ? `Do not end the story. Your LAST line, and only your last line, is a small gentle hook from Ajja ("tomorrow I will tell you what..."). No line after it.`
      : `Do not mention tomorrow, bedtime or rest; the chapter continues after you.`);
  const lines = [
    `Story: "${outline.title}" (${outline.kind}). Theme: ${outline.theme.valueWord} — ${outline.theme.moral}`,
    `Chapter ${chapterIndex + 1} of 8. This chapter's beat: ${ch.beat}`,
    prev,
    ending,
  ];
  if (priorLines?.length) {
    const tail = priorLines.slice(-6).join("\n");
    lines.push(
      `You have already written ${priorLines.length} lines of this chapter (about ${wordCount(priorLines.join(" "))} words). Continue the SAME scene with 14 to 20 MORE lines of about 300 words. Do not repeat any line. Stay in the same place with the same people. The last lines were:\n${tail}`,
    );
  } else {
    lines.push(`This is the FIRST half of the chapter: write 14 to 20 lines of about 300 words. End mid-scene; the second half will continue from you.`);
  }
  const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: lines.join("\n") }];
  if (feedback?.length) messages.push({ role: "user", content: `Your previous answer was rejected: ${feedback.join("; ")}. Return corrected JSON only.` });
  return messages;
}

export function parseChapter(raw: unknown): string[] | null {
  const t = extractAiText(raw);
  const obj = (typeof t === "string" ? (() => { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } })() : t) as { lines?: unknown } | null;
  if (!obj || !Array.isArray(obj.lines) || !obj.lines.every((l) => typeof l === "string")) return null;
  return obj.lines as string[];
}

export interface GeneratedChapter {
  lines: DialogueLine[];
  /** validated + punctuation-normalized body, ready for TTS line splitting */
  spoken: string;
  words: number;
  attempts: number;
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Generate one chapter of dialogue in two halves, each with validator retries.
 * One big model call will not reliably produce 600 words, so we write ~300
 * words twice and join them. Mirrors chota generateScript: strict validator,
 * feedback-quoting retries, fallback model on the last attempt of each half.
 * Chapter 0 gets the fixed intro prepended by code; chapter 7 gets the fixed outro appended.
 */
export async function generateChapter(
  ai: AiRunner,
  outline: EpisodeOutline,
  chapterIndex: number,
  opts: { model?: string; fallbackModel?: string; maxAttempts?: number } = {},
): Promise<GeneratedChapter> {
  const primary = opts.model ?? STORY_MODEL;
  const fallback = opts.fallbackModel ?? STORY_MODEL_FALLBACK;
  const max = opts.maxAttempts ?? 3;
  let attempts = 0;
  const first = await generateHalf(ai, outline, chapterIndex, undefined, primary, fallback, max);
  attempts += first.attempts;
  const second = await generateHalf(ai, outline, chapterIndex, first.lines, primary, fallback, max);
  attempts += second.attempts;
  const raw = [...first.lines, ...second.lines];
  const withFixed = [
    ...(chapterIndex === 0 ? [`AJJA: ${INTRO_LINE}`] : []),
    ...raw.map((l) => asciiPunct(l.trim())),
    ...(chapterIndex === 7 ? [`AJJA: ${OUTRO_LINE}`] : []),
  ];
  const spoken = withFixed.join("\n");
  const problems = validateChapterBody(spoken);
  if (problems.length) throw new Error(`joined chapter failed validation: ${problems.slice(0, 4).join("; ")}`);
  const words = wordCount(withFixed.map((l) => l.replace(/^(AJJA|KID):\s*/, "")).join(" "));
  if (words < MIN_CHAPTER_WORDS || words > MAX_CHAPTER_WORDS) {
    throw new Error(`joined chapter is ${words} words, target ${MIN_CHAPTER_WORDS}-${MAX_CHAPTER_WORDS}`);
  }
  return { lines: splitDialogue(spoken), spoken, words, attempts };
}

/** One ~300-word half-chapter with validator retries. */
async function generateHalf(
  ai: AiRunner,
  outline: EpisodeOutline,
  chapterIndex: number,
  priorLines: string[] | undefined,
  primary: string,
  fallback: string,
  max: number,
): Promise<{ lines: string[]; attempts: number }> {
  let feedback: string[] | undefined;
  for (let attempt = 1; attempt <= max; attempt++) {
    const model = attempt === max && max > 1 ? fallback : primary;
    let raw: string[] | null = null;
    try {
      const res = await ai(model, {
        messages: buildChapterMessages(outline, chapterIndex, feedback, priorLines),
        response_format: { type: "json_object" },
        // gpt-oss is a reasoning model: it spends tokens thinking before answering,
        // and with too little headroom it returns content:null (verified live: 4000 fails, 8000 works)
        max_tokens: /gpt-oss/.test(model) ? 8000 : 2500,
        temperature: 0.9,
      });
      raw = parseChapter(res);
    } catch (e) {
      feedback = [`request failed: ${(e as Error).message.slice(0, 120)}`];
      continue;
    }
    if (!raw) { feedback = ["answer was not a JSON object with a lines array"]; continue; }
    if (raw.length < 12 || raw.length > 24) { feedback = [`half has ${raw.length} lines, need 14-20 (about 300 words)`]; continue; }
    const errs = validateChapterBody(raw.join("\n"));
    if (errs.length) { feedback = errs.slice(0, 4); continue; }
    const words = wordCount(raw.map((l) => l.replace(/^(AJJA|KID):\s*/, "")).join(" "));
    if (words < 200 || words > 450) { feedback = [`half is ${words} words, target 250-400 (add or trim whole AJJA/KID lines)`]; continue; }
    return { lines: raw, attempts: attempt };
  }
  throw new Error(`chapter half failed after ${max} attempts: ${feedback?.join("; ")}`);
}
