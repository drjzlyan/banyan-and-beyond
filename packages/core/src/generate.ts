import { type AiRunner, STORY_MODEL, STORY_MODEL_FALLBACK, extractAiText } from "./ai.ts";
import { INTRO_LINE, OUTRO_LINE } from "./selection.ts";
import { SFX_IDS, asciiPunct, parseDialogue, splitDialogue, validateChapterBody } from "./story.ts";
import type { DialogueLine, EpisodeOutline } from "./types.ts";

/**
 * ~6-minute chapters (owner's choice, 2026-10-13). Measured live: Aura-2 at Ajja 0.80x / Kid 1.25x
 * runs about 0.43 s per word, so ~840 words ≈ 6 min ≈ 4,800 TTS chars ≈ 2 nights of voicing.
 * One model call plateaus near 300 words, so a chapter is written in CHAPTER_PARTS parts.
 */
export const CHAPTER_PARTS = 3;
export const PART_WORDS = 280;
export const MIN_CHAPTER_WORDS = 720;
export const MAX_CHAPTER_WORDS = 1050;

const SYSTEM = `You are Ajja, a warm Indian grandfather telling bedtime stories under the old banyan tree to his curious six-year-old grandchild. Your stories quietly teach good behaviour: honesty, kindness, duty, courage, respect, sharing, cleanliness, gratitude. You love old traditions and speak of elders and festivals with fondness, and you are kind to every person in the village. You never preach and never scold; the lesson grows out of what happens.
Make it SIMPLE and FUN for a five-to-eight-year-old:
- Use everyday words a small child knows: mango, puppy, river, school bag, grandmother, rain, kite. No hard or fancy words.
- Tell what people DO, SEE and HEAR. No abstract ideas and no poetic comparisons (never "honesty is a river" or "trust is sand").
- Use sound words kids love to repeat: "whoosh", "tap-tap-tap", "ding-dong", "splish-splash", "moo".
- Give the main characters simple names (Meena, Raju, Gopal the cow) and keep the same characters all the way through.
- The Kid is playful: guesses, giggles, gets things a bit wrong in a funny way, and asks "What happened next, Ajja?".
- Now and then Ajja asks the children watching a question ("What would YOU do?") and pauses with "Hmm?".
- Repeat one small catchy phrase a few times in the chapter, like a little chorus.
Output ONLY a JSON object: {"lines": string[]}. Every string is "AJJA: ...", "KID: ..." or a sound cue "SFX: <sound>".
Rules:
- Length is critical: 18 to 26 spoken lines and about 280 words. Count your lines before answering; anything under 16 spoken lines will be rejected.
- Every spoken line is ONE short sentence of 6 to 14 words. HARD LIMIT: never more than 18 words.
- Ajja speaks most lines; the Kid speaks at least 5 lines. Never two Kid lines in a row.
- Add 3 to 5 sound cues, each on its own line, placed just BEFORE the line it belongs to. Use ONLY these sounds: ${SFX_IDS.join(", ")}. Never two cues in a row.
- NEVER write digits. Spell out tiny counts if you must ("two mangoes").
- Never use frightening, violent or mean words. Nobody dies, nobody is hurt, no ghosts or monsters.
- Stay inside this chapter's beat. Do not finish the whole story and do not say the final moral in words; let events show it.
- Do not mention chapters, episodes, YouTube, or that you are an AI.`;

export function buildChapterMessages(
  outline: EpisodeOutline,
  chapterIndex: number,
  feedback?: string[],
  priorLines?: string[],
  part: { index: number; count: number } = { index: priorLines?.length ? CHAPTER_PARTS - 1 : 0, count: CHAPTER_PARTS },
) {
  const ch = outline.chapters[chapterIndex];
  // Ajja's welcome line is prepended by code, so the model must not welcome the children again.
  const prev = chapterIndex > 0 ? `Previous chapter ended with: ${outline.chapters[chapterIndex - 1].beat}` : `This is the opening chapter. Ajja has ALREADY greeted the children (that line is added for you), so do not welcome or greet them again; go straight into the story.`;
  const lastPart = part.index === part.count - 1;
  // The hook belongs at the very end of the chapter only. Telling every part to end on a
  // hook produced several "tomorrow" promises mid-chapter (seen live in episode 1, chapter 1).
  const ending = chapterIndex === 7
    ? (lastPart
      ? `This is the closing chapter: gather everyone warmly and end with a soft bedtime farewell. Do NOT state the moral as a lesson sentence; show it in what happens.`
      : `This is the closing chapter, but this is not its last part: do not say goodbye yet.`)
    : (lastPart
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
      `This is part ${part.index + 1} of ${part.count}. You have already written ${priorLines.length} lines of this chapter (about ${spokenWords(priorLines)} words). Continue the SAME scene with 18 to 26 MORE spoken lines (about ${PART_WORDS} words) and 3 to 5 sound cues. Do not repeat any line or retell what already happened; move the beat forward. The last lines were:\n${tail}`,
    );
  } else {
    lines.push(`This is part 1 of ${part.count} of the chapter: write 18 to 26 spoken lines (about ${PART_WORDS} words) and 3 to 5 sound cues. End mid-scene; the next part will continue from you.`);
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

/** Words actually spoken (sound cues and speaker tags excluded). */
export function spokenWords(rows: string[]): number {
  return wordCount((parseDialogue(rows.join("\n")).filter(Boolean) as DialogueLine[]).map((l) => l.text).join(" "));
}

/**
 * Generate one chapter of dialogue in CHAPTER_PARTS parts, each with validator retries.
 * One big model call will not reliably produce 840 words, so we write ~280
 * words per part, each continuing from the lines so far, and join them. Mirrors chota generateScript: strict validator,
 * feedback-quoting retries, fallback model on the last attempt of each part.
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
  const raw: string[] = [];
  for (let index = 0; index < CHAPTER_PARTS; index++) {
    const part = await generatePart(ai, outline, chapterIndex, raw.length ? [...raw] : undefined, { index, count: CHAPTER_PARTS }, primary, fallback, max);
    attempts += part.attempts;
    raw.push(...part.lines);
  }
  const withFixed = [
    ...(chapterIndex === 0 ? [`AJJA: ${INTRO_LINE}`] : []),
    ...raw.map((l) => asciiPunct(l.trim())),
    ...(chapterIndex === 7 ? [`AJJA: ${OUTRO_LINE}`] : []),
  ];
  const spoken = withFixed.join("\n");
  const problems = validateChapterBody(spoken);
  if (problems.length) throw new Error(`joined chapter failed validation: ${problems.slice(0, 4).join("; ")}`);
  const words = spokenWords(withFixed);
  if (words < MIN_CHAPTER_WORDS || words > MAX_CHAPTER_WORDS) {
    throw new Error(`joined chapter is ${words} words, target ${MIN_CHAPTER_WORDS}-${MAX_CHAPTER_WORDS}`);
  }
  return { lines: splitDialogue(spoken), spoken, words, attempts };
}

/** One ~280-word part of a chapter with validator retries. */
async function generatePart(
  ai: AiRunner,
  outline: EpisodeOutline,
  chapterIndex: number,
  priorLines: string[] | undefined,
  part: { index: number; count: number },
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
        messages: buildChapterMessages(outline, chapterIndex, feedback, priorLines, part),
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
    const spoken = parseDialogue(raw.join("\n")).length;
    if (spoken < 16 || spoken > 30) { feedback = [`this part has ${spoken} spoken lines, need 18-26 short lines (about ${PART_WORDS} words)`]; continue; }
    const errs = validateChapterBody(raw.join("\n"));
    if (errs.length) { feedback = errs.slice(0, 4); continue; }
    const words = spokenWords(raw);
    if (words < 200 || words > 400) { feedback = [`this part is ${words} words, target 240-340 (add or trim whole AJJA/KID lines)`]; continue; }
    return { lines: raw, attempts: attempt };
  }
  throw new Error(`chapter part ${part.index + 1} failed after ${max} attempts: ${feedback?.join("; ")}`);
}
