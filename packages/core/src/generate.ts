import { type AiRunner, STORY_MODEL, STORY_MODEL_FALLBACK, extractAiText } from "./ai.ts";
import { premiseById, type Premise } from "./premises.ts";
import { INTRO_LINE, OUTRO_LINE } from "./selection.ts";
import { SFX, SFX_IDS, type SfxId, tuneCues } from "./sounds.ts";
import { asciiPunct, stripStageDirections, hasBannedWord, isViewerQuestion, parseDialogue, parseScript, splitDialogue, storyProblems, validateChapterBody, type ScriptItem } from "./story.ts";
import type { DialogueLine, EpisodeOutline, StoryPlan } from "./types.ts";
import { CAST_KINDS, CAST_KIND_IDS, LOCATIONS, LOCATION_IDS, MOODS, RESERVED_SPEAKERS, isCastKind, isLocation, isMood } from "./world.ts";

/**
 * Standalone ~7-minute stories (owner's choice, 2026-10-22), written in two steps:
 * 1. planStory: one call turns a public-domain premise into a plan: cast, catchphrase, a mystery
 *    with its set-up and pay-off scenes, and 6-8 scenes that each move the plot exactly once.
 * 2. writeScenes: one call per scene writes it against that plan, told which scenes are done.
 * Before this, each part of a chapter was written blind from the last six lines and replayed the
 * prompt's whole checklist; the live result solved the same "secret box" four times in one chapter.
 * Measured live: Aura-2 at the owner's pitches runs about 0.43 s per word, so ~900 words ≈ 7 min.
 */
export const SCENES_MIN = 6;
export const SCENES_MAX = 8;
export const SCENE_WORDS = 130;
/** Measured live: a good scene comes back at 75-135 words. */
export const MIN_SCENE_WORDS = 65;
export const TARGET_STORY_WORDS = 900;
/** Hard window for the joined story; the floor is what six short valid scenes reach. */
export const MIN_STORY_WORDS = 600;
export const MAX_STORY_WORDS = 1400;
/** Kept for callers that still speak of chapters (one story = one chapter). */
export const MIN_CHAPTER_WORDS = MIN_STORY_WORDS;
export const MAX_CHAPTER_WORDS = MAX_STORY_WORDS;

const SAFE = `Never use frightening, violent or mean words. Nobody dies, nobody is hurt, no ghosts or monsters; worries stay small and end kindly. NEVER write digits. Do not mention videos, YouTube, chapters or that you are an AI.`;

const PLAN_SYSTEM = `You plan short animated story videos for children aged five to eight, told by Ajja, a warm Indian grandfather, under the old banyan tree. The stories are fun first; the lesson grows out of what happens and is never preached.
${SAFE}
Output ONLY a JSON object.`;

export function buildPlanMessages(outline: EpisodeOutline, premise: Premise | undefined, feedback?: string[]) {
  const kinds = CAST_KIND_IDS.join(", ");
  const places = LOCATION_IDS.filter((l) => l !== "banyan").map((l) => `${l} (${LOCATIONS[l]})`).join("; ");
  const user = [
    `Value: ${outline.theme.valueWord} — ${outline.theme.moral}`,
    premise ? `Retell this plot (${premise.source}) in your own simple way, keeping its twist: ${premise.plot}` : `Invent a simple plot about ${outline.theme.valueWord.toLowerCase()} with a funny twist.`,
    premise ? `Suggested cast kinds: ${premise.cast.join(", ")}. Suggested places: ${premise.locations.join(", ")}.` : "",
    `Plan it as JSON with exactly these keys:
{"title": short fun title,
 "want": what the hero wants or must solve, one sentence,
 "cast": two to four characters, each {"id": the name in CAPITALS (e.g. "MEENA"), "name": "Meena", "kind": one of [${kinds}], "trait": one simple word like curious, clumsy, bossy, shy},
 "chorus": a catchy phrase of three to seven words the characters repeat (e.g. "Slow and steady, here we go!"),
 "mystery": {"question": a small puzzle set up early, "answer": its surprising answer, "setupScene": 1 or 2, "payoffScene": a later scene number},
 "scenes": seven or eight scenes, each {"location": one of [${LOCATION_IDS.filter((l) => l !== "banyan").join(", ")}], "cast": ids present, "beat": what happens in one sentence, "funny": the small funny moment (a silly guess, a slip, an animal doing something cheeky), "mood": one of [${MOODS.join(", ")}]}}`,
    `Shape: scene one hooks at once and shows the want. Then the first try fails, the second try fails in a funnier way, someone finds a clue, the third try works with a surprising twist, and the last scene celebrates. Every scene must change something; no scene may repeat another scene's event.`,
    `Places: ${places}. Use two to four places. Animal characters may talk.`,
  ].filter(Boolean).join("\n");
  const messages = [{ role: "system", content: PLAN_SYSTEM }, { role: "user", content: user }];
  if (feedback?.length) messages.push({ role: "user", content: `Your previous plan was rejected: ${feedback.join("; ")}. Return the corrected JSON only.` });
  return messages;
}

const words = (t: string) => t.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3);

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** The prompt bans digits, so the model sometimes writes scene numbers as words ("four"). */
const toNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? (NUMBER_WORDS.indexOf(v.trim().toLowerCase()) >= 0 ? NUMBER_WORDS.indexOf(v.trim().toLowerCase()) : Number(v)) : NaN);

/** Fix what is safe to fix before judging a plan: number words, and Ajja or the Kid listed as story characters. */
function tidyPlan(raw: unknown): unknown {
  const p = raw as Partial<StoryPlan> | null;
  if (!p || typeof p !== "object") return p;
  const reserved = (id: unknown) => typeof id === "string" && RESERVED_SPEAKERS.includes(id.trim().toUpperCase());
  return {
    ...p,
    cast: Array.isArray(p.cast) ? p.cast.filter((c) => !reserved(c?.id)) : p.cast,
    scenes: Array.isArray(p.scenes) ? p.scenes.map((s) => ({ ...s, cast: Array.isArray(s?.cast) ? s.cast.filter((c) => !reserved(c)) : s?.cast })) : p.scenes,
    mystery: p.mystery ? { ...p.mystery, setupScene: toNumber(p.mystery.setupScene), payoffScene: toNumber(p.mystery.payoffScene) } : p.mystery,
  };
}

/** Deterministic checks on a story plan. Returns problems (empty = usable). */
export function validatePlan(input: unknown): { plan: StoryPlan | null; problems: string[] } {
  const p = tidyPlan(input) as Partial<StoryPlan> | null;
  const problems: string[] = [];
  if (!p || typeof p !== "object") return { plan: null, problems: ["answer was not a JSON object"] };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!str(p.title) || str(p.title).length > 60) problems.push("title must be a short string");
  if (!str(p.want)) problems.push("want is missing");
  const cast = Array.isArray(p.cast) ? p.cast : [];
  if (cast.length < 2 || cast.length > 4) problems.push(`cast needs two to four characters, has ${cast.length}`);
  const ids = new Set<string>();
  for (const c of cast) {
    const id = str(c?.id);
    if (!/^[A-Z][A-Z_]{1,11}$/.test(id) || RESERVED_SPEAKERS.includes(id)) problems.push(`cast id "${id}" must be a name in CAPITALS (not ${RESERVED_SPEAKERS.join("/")})`);
    else if (ids.has(id)) problems.push(`cast id ${id} is used twice`);
    ids.add(id);
    if (!str(c?.name)) problems.push(`cast ${id} needs a name`);
    if (!isCastKind(c?.kind)) problems.push(`cast ${id} kind "${c?.kind}" must be one of ${CAST_KIND_IDS.join(", ")}`);
  }
  const chorusWords = str(p.chorus).split(/\s+/).filter(Boolean).length;
  if (chorusWords < 2 || chorusWords > 9) problems.push("chorus must be a phrase of three to seven words");
  const scenes = Array.isArray(p.scenes) ? p.scenes : [];
  if (scenes.length < SCENES_MIN || scenes.length > SCENES_MAX) problems.push(`needs ${SCENES_MIN} to ${SCENES_MAX} scenes, has ${scenes.length}`);
  scenes.forEach((s, i) => {
    if (!isLocation(s?.location) || s.location === "banyan") problems.push(`scene ${i + 1} location "${s?.location}" must be one of ${LOCATION_IDS.filter((l) => l !== "banyan").join(", ")}`);
    const sc = Array.isArray(s?.cast) ? s.cast : [];
    if (!sc.length || sc.some((c) => !ids.has(c))) problems.push(`scene ${i + 1} cast must list ids from the cast (${[...ids].join(", ")})`);
    if (str(s?.beat).split(/\s+/).length < 5) problems.push(`scene ${i + 1} needs a real beat sentence`);
    if (!str(s?.funny)) problems.push(`scene ${i + 1} needs a funny moment`);
    if (!isMood(s?.mood)) problems.push(`scene ${i + 1} mood must be one of ${MOODS.join(", ")}`);
  });
  // the replay bug: two scenes doing the same thing
  for (let i = 0; i < scenes.length; i++) for (let j = i + 1; j < scenes.length; j++) {
    const a = new Set(words(str(scenes[i]?.beat))), b = new Set(words(str(scenes[j]?.beat)));
    const inter = [...a].filter((w) => b.has(w)).length;
    if (a.size && b.size && inter / Math.min(a.size, b.size) >= 0.7) problems.push(`scenes ${i + 1} and ${j + 1} have the same beat; each scene must move the story on`);
  }
  const m = p.mystery;
  if (!m || !str(m.question) || !str(m.answer)) problems.push("mystery needs a question and an answer");
  else if (!(m.setupScene >= 1 && m.setupScene <= 2 && m.payoffScene >= m.setupScene + 2 && m.payoffScene <= scenes.length)) {
    problems.push(`mystery setupScene must be 1 or 2 and payoffScene at least two scenes later (got ${m.setupScene} and ${m.payoffScene})`);
  }
  const banned = hasBannedWord(JSON.stringify(p));
  if (banned) problems.push(`the plan uses a forbidden word ("${banned}")`);
  return { plan: problems.length ? null : (p as StoryPlan), problems };
}

/** One call: premise -> validated plan, with feedback retries and the fallback model on the last attempt. */
export async function planStory(ai: AiRunner, outline: EpisodeOutline, opts: GenOpts = {}): Promise<{ plan: StoryPlan; attempts: number }> {
  const premise = outline.premiseId ? premiseById(outline.premiseId) : undefined;
  let feedback: string[] | undefined;
  const max = opts.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= max; attempt++) {
    const model = attempt === max && max > 1 ? (opts.fallbackModel ?? STORY_MODEL_FALLBACK) : (opts.model ?? STORY_MODEL);
    let raw: unknown;
    try {
      raw = parseJson(await ai(model, { messages: buildPlanMessages(outline, premise, feedback), response_format: { type: "json_object" }, max_tokens: tokens(model), temperature: 0.9 }));
    } catch (e) {
      if (opts.rethrow?.(e)) throw e;
      feedback = [`request failed: ${(e as Error).message.slice(0, 120)}`];
      continue;
    }
    const { plan, problems } = validatePlan(raw);
    if (plan) return { plan: normalizePlan(plan), attempts: attempt };
    feedback = problems.slice(0, 5);
    opts.log?.(`plan attempt ${attempt} (${model}) rejected: ${feedback.join("; ")}`);
  }
  throw new Error(`story plan failed after ${max} attempts: ${feedback?.join("; ")}`);
}

const normalizePlan = (p: StoryPlan): StoryPlan => ({
  ...p,
  title: asciiPunct(p.title.trim()),
  chorus: asciiPunct(p.chorus.trim()),
  cast: p.cast.map((c) => ({ ...c, id: c.id.trim(), name: asciiPunct(c.name.trim()) })),
});

/* ---------- scene writing ---------- */

const WRITE_SYSTEM = `You write the spoken script of a short animated story video for children aged five to eight.
Ajja, a warm Indian grandfather, tells the story under the old banyan tree. His granddaughter (KID) sits beside him and listens. The story's characters speak their own lines, and we SEE them act it out.
Speakers:
- AJJA narrates what happens: short, lively, playful sentences with sound words (splash, knock, boing, moo, giggle).
- The characters (by their ids) say their own short lines, like real children, parents and animals talk. Give each character one way of talking that fits their trait.
- KID is NOT in the story. She listens and reacts: she gasps, giggles, guesses what will happen ("I think the monkey took it!"), or asks Ajja a question. She never says what she did, because she was not there.
Style: everyday words a small child knows. Lines of four to fourteen words, one sentence each. Say what people DO, SEE and HEAR, and how they feel. No comparisons or metaphors (never "kindness is like sunshine"). Something funny in every scene.
${SAFE}
Output ONLY JSON: {"lines": string[]}. Each string is "SCENE: <number>", "<SPEAKER>: <text>" or a sound cue "SFX: <sound>".`;

export interface GenOpts {
  model?: string;
  fallbackModel?: string;
  maxAttempts?: number;
  /** errors that must not be retried here (neuron exhaustion pauses the nightly run) */
  rethrow?: (e: unknown) => boolean;
  /** called after every rejected attempt (logs in the worker, the demo script) */
  log?: (msg: string) => void;
}

/**
 * Scenes per model call. Measured live (2026-10-22): asked for three scenes (~390 words), gpt-oss
 * wrote 153, the same ~150-250-word plateau one call hit before. One scene (~130 words) per call
 * fits under it, so a story is the plan plus one call per scene.
 */
export const SCENES_PER_CALL = 1;

export function sceneBatches(count: number, perCall = SCENES_PER_CALL): number[][] {
  const out: number[][] = [];
  for (let n = 1; n <= count; n += perCall) out.push(Array.from({ length: Math.min(perCall, count - n + 1) }, (_, k) => n + k));
  return out;
}

/** Scenes where Ajja asks the children watching a question: about a third and two thirds in. */
export const viewerQuestionScenes = (count: number) => [Math.max(2, Math.round(count / 3)), Math.max(3, Math.round((count * 2) / 3))];
/** Scenes where the chorus is said: early, middle and the last. */
export const chorusScenes = (count: number) => [1, Math.ceil(count / 2), count];

export function buildSceneMessages(outline: EpisodeOutline, plan: StoryPlan, scenes: number[], prior: string[], feedback?: string[]) {
  const total = plan.scenes.length;
  const cast = plan.cast.map((c) => `${c.id} = ${c.name}, a ${c.trait} ${c.kind}`).join("; ");
  const sceneText = (n: number) => {
    const s = plan.scenes[n - 1]!;
    return `Scene ${n} at the ${s.location} with ${s.cast.join(", ")} (${s.mood}): ${s.beat} Funny moment: ${s.funny}`;
  };
  const done = scenes[0]! - 1;
  const m = plan.mystery;
  const rules: string[] = [];
  for (const n of scenes) {
    const r: string[] = [];
    if (n === 1) r.push("start with a hook in the very first lines: a sound, a surprise or a question. Ajja has ALREADY welcomed the children (added for you), so do not greet them");
    if (n === m.setupScene) r.push(`plant the mystery ("${m.question}") but do NOT answer it`);
    else if (n === m.payoffScene) r.push(`answer the mystery: ${m.answer}`);
    else if (n < m.payoffScene && n > m.setupScene) r.push("the mystery stays unsolved here; at most a small hint");
    if (viewerQuestionScenes(total).includes(n)) r.push(`Ajja asks the children watching ONE question with a capital YOU, ending with "Hmm?" (e.g. "What would YOU do? Hmm?")`);
    if (chorusScenes(total).includes(n)) r.push(`someone says the chorus "${plan.chorus}"`);
    if (n === total) r.push("celebrate warmly and let the lesson show in what happened; Ajja says the last line; no goodbye (added by code), no 'tomorrow'");
    if (r.length) rules.push(`In scene ${n}: ${r.join("; ")}.`);
  }
  const user = [
    `Story: "${plan.title}". Value: ${outline.theme.valueWord}. The hero wants: ${plan.want}`,
    `Cast (use these ids as speaker tags): ${cast}.`,
    `The whole plan:\n${plan.scenes.map((_, i) => sceneText(i + 1)).join("\n")}`,
    done > 0
      ? `Scenes 1 to ${done} are ALREADY written. Their events are done: never repeat or retell them, and do not set up again what was already set up. The last lines were:\n${prior.slice(-6).join("\n")}`
      : "",
    `Write scene${scenes.length > 1 ? "s" : ""} ${scenes.join(", ")} now. Start each scene with its row "SCENE: <number>". Each scene has 10 to 15 spoken lines (about ${SCENE_WORDS} words): mostly AJJA narrating and the characters talking; KID speaks once or twice per scene.`,
    ...rules,
    `Do not ask the children watching anything outside the scenes named above.`,
    `Sound cues are optional: put "SFX: <sound>" just before a line that names that sound, at most two per scene. Sounds: ${SFX_IDS.map((id) => `${id} (${SFX[id].label})`).join(", ")}.`,
  ].filter(Boolean).join("\n");
  const messages = [{ role: "system", content: WRITE_SYSTEM }, { role: "user", content: user }];
  if (feedback?.length) messages.push({ role: "user", content: `Your previous answer was rejected: ${feedback.join("; ")}. Return corrected JSON only.` });
  return messages;
}

/** Problems with one batch of scenes, given what was written before it. */
export function checkScenes(rows: string[], scenes: number[], plan: StoryPlan, prior: string[]): string[] {
  const items = parseScript(rows.join("\n"));
  const speakers = plan.cast.map((c) => c.id);
  const problems = validateChapterBody(rows.join("\n"), { speakers });
  const marks = items.filter((it): it is Extract<ScriptItem, { kind: "scene" }> => it?.kind === "scene").map((s) => s.n);
  if (marks.join(",") !== scenes.join(",")) problems.unshift(`write exactly the rows SCENE: ${scenes.join(", SCENE: ")} in order (got ${marks.join(", ") || "none"})`);
  if (items[0]?.kind !== "scene") problems.unshift(`the first row must be SCENE: ${scenes[0]}`);
  // spoken lines per scene
  let cur = 0;
  const perScene = new Map<number, number>();
  for (const it of items) {
    if (it?.kind === "scene") cur = it.n;
    else if (it?.kind === "line") perScene.set(cur, (perScene.get(cur) ?? 0) + 1);
  }
  for (const n of scenes) {
    const k = perScene.get(n) ?? 0;
    if (k < 7) problems.push(`scene ${n} has ${k} spoken lines, needs 10 to 15`);
    if (k > 22) problems.push(`scene ${n} has ${k} spoken lines, keep it to 10 to 15`);
  }
  // story-level checks, reported only for the new lines
  const before = (parseDialogue(prior.join("\n")).filter(Boolean) as DialogueLine[]);
  const now = parseDialogue(rows.join("\n")).filter(Boolean) as DialogueLine[];
  const total = plan.scenes.length;
  const allowedQs = scenes.filter((n) => viewerQuestionScenes(total).includes(n)).length;
  const qs = now.filter(isViewerQuestion).length;
  if (qs > allowedQs) problems.push(`Ajja asks the viewers ${qs} times here; only ${allowedQs} allowed in these scenes`);
  const story = storyProblems([...before, ...now], { chorus: plan.chorus, maxViewerQuestions: 99 });
  for (const p of story) {
    const at = Number(p.match(/^line (\d+)/)?.[1] ?? 0);
    if (at > before.length) problems.push(p.replace(/^line (\d+)/, (_, n) => `line ${Number(n) - before.length}`));
  }
  return problems;
}

export interface GeneratedStory {
  plan: StoryPlan;
  lines: DialogueLine[];
  /** validated script: speaker lines, SCENE marks and SFX cues, ready for TTS line splitting */
  spoken: string;
  words: number;
  attempts: number;
  /** model cues dropped as unrelated to their line */
  droppedCues: string[];
}

/** Plan (unless given) and write a whole standalone story. Intro and outro are fixed by code. */
export async function generateStory(ai: AiRunner, outline: EpisodeOutline, opts: GenOpts & { plan?: StoryPlan } = {}): Promise<GeneratedStory> {
  let attempts = 0;
  let plan = opts.plan;
  if (!plan) {
    const p = await planStory(ai, outline, opts);
    plan = p.plan;
    attempts += p.attempts;
  }
  const raw: string[] = [];
  for (const scenes of sceneBatches(plan.scenes.length)) {
    const out = await writeScenes(ai, outline, plan, scenes, raw, opts);
    attempts += out.attempts;
    raw.push(...out.rows);
  }
  const animals = plan.cast.filter((c) => !CAST_KINDS[c.kind].human).map((c) => ({ name: c.name, sound: CAST_KINDS[c.kind].sound as SfxId | null }));
  const items = parseScript(raw.map((l) => asciiPunct(l.trim())).join("\n")).filter(Boolean) as ScriptItem[];
  const tuned = tuneCues(items, { animals });
  const body = tuned.rows.map((it) => (it.kind === "scene" ? `SCENE: ${it.n}` : it.kind === "sfx" ? `SFX: ${it.id}` : `${it.speaker}: ${it.text}`));
  const spoken = [`AJJA: ${INTRO_LINE}`, ...body, `AJJA: ${OUTRO_LINE}`].join("\n");
  const speakers = plan.cast.map((c) => c.id);
  const problems = validateChapterBody(spoken, { speakers });
  if (problems.length) throw new Error(`joined story failed validation: ${problems.slice(0, 4).join("; ")}`);
  const lines = splitDialogue(spoken, { speakers });
  const words = spokenWords(spoken.split("\n"));
  if (words < MIN_STORY_WORDS || words > MAX_STORY_WORDS) throw new Error(`joined story is ${words} words, target ${MIN_STORY_WORDS}-${MAX_STORY_WORDS}`);
  return { plan, lines, spoken, words, attempts, droppedCues: tuned.dropped };
}

/** One batch of scenes with validator retries. */
async function writeScenes(ai: AiRunner, outline: EpisodeOutline, plan: StoryPlan, scenes: number[], prior: string[], opts: GenOpts): Promise<{ rows: string[]; attempts: number }> {
  let feedback: string[] | undefined;
  const max = opts.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= max; attempt++) {
    const model = attempt === max && max > 1 ? (opts.fallbackModel ?? STORY_MODEL_FALLBACK) : (opts.model ?? STORY_MODEL);
    let rows: string[] | null = null;
    try {
      rows = parseChapter(await ai(model, { messages: buildSceneMessages(outline, plan, scenes, prior, feedback), response_format: { type: "json_object" }, max_tokens: tokens(model), temperature: 0.9 }));
    } catch (e) {
      if (opts.rethrow?.(e)) throw e;
      feedback = [`request failed: ${(e as Error).message.slice(0, 120)}`];
      continue;
    }
    if (!rows) { feedback = ["answer was not a JSON object with a lines array"]; continue; }
    rows = dropBadCues(rows.map((r) => stripStageDirections(asciiPunct(r.trim()))).filter((r) => r && !/^[A-Z_]+:\s*$/.test(r)));
    const problems = checkScenes(rows, scenes, plan, prior);
    const w = spokenWords(rows);
    if (w < scenes.length * MIN_SCENE_WORDS || w > scenes.length * 220) problems.push(`these scenes have ${w} words, aim for about ${scenes.length * SCENE_WORDS}`);
    if (!problems.length) return { rows, attempts: attempt };
    feedback = problems.slice(0, 5);
    opts.log?.(`scenes ${scenes.join(",")} attempt ${attempt} (${model}, ${w} words, ${rows.length} rows) rejected: ${feedback.join("; ")}\n  ${rows.join("\n  ")}`);
  }
  throw new Error(`scenes ${scenes.join(",")} failed after ${max} attempts: ${feedback?.join("; ")}`);
}

/* ---------- helpers ---------- */

/** Sound cues are optional and chosen again in code, so a bad one is removed instead of rejecting the scene. */
export function dropBadCues(rows: string[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const m = r.match(/^SFX:\s*(.*)$/i);
    if (m && (!(SFX_IDS as string[]).includes(m[1]!.trim().toLowerCase()) || /^SFX:/i.test(out[out.length - 1] ?? ""))) continue;
    out.push(m ? `SFX: ${m[1]!.trim().toLowerCase()}` : r);
  }
  return out;
}

// gpt-oss is a reasoning model: it spends tokens thinking before answering, and with too little
// headroom it returns content:null (verified live: 4000 fails, 8000 works)
const tokens = (model: string) => (/gpt-oss/.test(model) ? 8000 : 3000);

function parseJson(res: unknown): unknown {
  const t = extractAiText(res);
  if (typeof t !== "string") return t;
  const m = t.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

export function parseChapter(raw: unknown): string[] | null {
  const obj = parseJson(raw) as { lines?: unknown } | null;
  if (!obj || !Array.isArray(obj.lines) || !obj.lines.every((l) => typeof l === "string")) return null;
  return obj.lines as string[];
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Words actually spoken (cues, scene marks and speaker tags excluded). */
export function spokenWords(rows: string[]): number {
  return wordCount((parseDialogue(rows.join("\n")).filter(Boolean) as DialogueLine[]).map((l) => l.text).join(" "));
}
