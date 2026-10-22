import { describe, expect, it, vi } from "vitest";
import type { AiRunner } from "../src/ai.ts";
import { checkScenes, dropBadCues, generateStory, MAX_STORY_WORDS, MIN_STORY_WORDS, sceneBatches, validatePlan, viewerQuestionScenes } from "../src/generate.ts";
import { premiseById } from "../src/premises.ts";
import { buildOutline } from "../src/selection.ts";
import { sceneMarks } from "../src/story.ts";
import { themeById } from "../src/themes.ts";
import type { StoryPlan } from "../src/types.ts";

const outline = buildOutline(themeById("kindness")!, "folk-tale", premiseById("thirsty-dog"));
const PRIMARY = "@cf/openai/gpt-oss-120b";
const FALLBACK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const PLAN: StoryPlan = {
  title: "Water for Moti",
  want: "Meena wants to help a thirsty puppy on the hottest day.",
  cast: [
    { id: "MEENA", name: "Meena", kind: "girl", trait: "determined" },
    { id: "MOTI", name: "Moti", kind: "dog", trait: "cheeky" },
    { id: "DADI", name: "Dadi", kind: "grandmother", trait: "wise" },
  ],
  chorus: "One more try, up goes the sky!",
  mystery: { question: "Who keeps leaving wet paw prints?", answer: "Moti, sneaking to the pot", setupScene: 1, payoffScene: 5 },
  scenes: [
    { location: "village-lane", cast: ["MEENA", "MOTI"], beat: "Meena finds a panting puppy beside the dry well.", funny: "Moti licks her nose", mood: "curious" },
    { location: "village-lane", cast: ["MEENA", "MOTI"], beat: "Her little bucket on the rope is far too short.", funny: "the bucket comes up holding a frog", mood: "worried" },
    { location: "courtyard", cast: ["MEENA", "DADI"], beat: "She asks Dadi for a longer rope but it tangles.", funny: "Dadi gets wrapped like a parcel", mood: "playful" },
    { location: "village-lane", cast: ["MEENA", "DADI"], beat: "Dadi remembers how children once made a chain of hands.", funny: "the chain sneezes from the dust", mood: "curious" },
    { location: "village-lane", cast: ["MEENA", "MOTI", "DADI"], beat: "Every friend joins hands and the water finally reaches Moti.", funny: "Moti shakes water over everyone", mood: "triumphant" },
    { location: "courtyard", cast: ["MEENA", "MOTI", "DADI"], beat: "The lane celebrates and Moti becomes the lane's new guard.", funny: "Moti barks at his own tail", mood: "triumphant" },
  ],
};

/** Distinct made-up words, so the repeat detector sees every fake line as new. */
const SYL = ["ka", "lo", "mi", "ra", "su", "te", "no", "vi"];
let n = 0;
const word = () => { const i = n++; return SYL[i % 8] + SYL[(i >> 3) % 8] + SYL[(i >> 6) % 8] + SYL[(i >> 9) % 8]; };
const words = (k: number) => Array.from({ length: k }, word).join(" ");

/** A valid batch for the scenes the prompt asks for: 12 lines a scene, one Kid line, viewer questions where assigned. */
function fakeScenes(prompt: string, opts: { kidNarrates?: boolean } = {}): string[] {
  const nums = (prompt.match(/Write scenes? ([\d, ]+) now/)?.[1] ?? "1").split(",").map((s) => Number(s.trim()));
  const rows: string[] = [];
  for (const s of nums) {
    rows.push(`SCENE: ${s}`);
    for (let i = 0; i < 12; i++) {
      const who = i === 5 ? "KID" : i % 3 === 1 ? "MEENA" : "AJJA";
      rows.push(`${who}: ${who === "KID" && opts.kidNarrates ? "I ran to the well and" : ""} ${words(10)}.`.replace(/\s+/g, " "));
      if (i === 2) rows.push("SFX: splash");
    }
    if (viewerQuestionScenes(PLAN.scenes.length).includes(s)) rows.push("AJJA: What would YOU do for a thirsty puppy? Hmm?");
  }
  return rows;
}

const promptOf = (input: Record<string, unknown>) => (input.messages as { content: string }[]).map((m) => m.content).join("\n");
const json = (v: unknown) => ({ response: JSON.stringify(v) });

function fakeAi(opts: { plan?: unknown; kidNarratesOnce?: boolean } = {}) {
  let narrated = false;
  return vi.fn<AiRunner>(async (_model, input) => {
    const p = promptOf(input);
    if (/Plan it as JSON/.test(p)) return json(opts.plan ?? PLAN);
    const kid = opts.kidNarratesOnce && !narrated;
    narrated = true;
    return json({ lines: fakeScenes(p, { kidNarrates: kid }) });
  });
}

describe("generateStory (plan, then scenes)", () => {
  it("plans once, writes each scene in its own call and joins them with the fixed intro and outro", async () => {
    const ai = fakeAi();
    const out = await generateStory(ai, outline, { maxAttempts: 2 });
    expect(ai).toHaveBeenCalledTimes(7);
    expect(out.plan.title).toBe("Water for Moti");
    const rows = out.spoken.split("\n");
    expect(rows[0]).toMatch(/^AJJA: Namaste little friends/);
    expect(rows[rows.length - 1]).toMatch(/^AJJA: Tell someone you love/);
    expect(sceneMarks(out.spoken).map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(out.lines.map((l) => l.speaker))).toEqual(new Set(["AJJA", "KID", "MEENA"]));
    expect(out.words).toBeGreaterThanOrEqual(MIN_STORY_WORDS);
    expect(out.words).toBeLessThanOrEqual(MAX_STORY_WORDS);
    // each batch sees what is done and is told not to replay it
    const prompts = ai.mock.calls.map((c) => promptOf(c[1]));
    expect(prompts[1]).toMatch(/Write scene 1 now/);
    expect(prompts[1]).toMatch(/plant the mystery \("Who keeps leaving wet paw prints\?"\) but do NOT answer it/);
    expect(prompts[3]).toMatch(/Scenes 1 to 2 are ALREADY written[\s\S]*never repeat or retell them/);
    expect(prompts[5]).toMatch(/answer the mystery: Moti, sneaking to the pot/);
    expect(prompts[6]).toMatch(/celebrate warmly/);
  });

  it("drops the model's unrelated sound cues and keeps the ones its words call for", async () => {
    const out = await generateStory(fakeAi(), outline, { maxAttempts: 1 });
    // the fake writes "SFX: splash" before lines that never mention water
    expect(out.spoken).not.toMatch(/^SFX: splash$/m);
    expect(out.droppedCues.length).toBeGreaterThan(0);
  });

  it("retries a batch where the Kid narrates the story, quoting the problem", async () => {
    const ai = fakeAi({ kidNarratesOnce: true });
    await generateStory(ai, outline, { maxAttempts: 2 });
    const retry = promptOf(ai.mock.calls[2]![1]);
    expect(retry).toMatch(/rejected: .*the Kid is listening under the banyan tree/);
  });

  it("re-plans with feedback and falls back to the second model on the last attempt", async () => {
    const calls: string[] = [];
    const ai: AiRunner = async (model, input) => {
      calls.push(model);
      if (/Plan it as JSON/.test(promptOf(input))) return json({ ...PLAN, cast: [PLAN.cast[0]] });
      return json({ lines: [] });
    };
    await expect(generateStory(ai, outline, { maxAttempts: 3 })).rejects.toThrow(/story plan failed after 3 attempts: cast needs two to four/);
    expect(calls).toEqual([PRIMARY, PRIMARY, FALLBACK]);
  });

  it("lets neuron exhaustion escape instead of retrying", async () => {
    const ai: AiRunner = vi.fn(async () => { throw new Error("3036: neurons used up"); });
    await expect(generateStory(ai, outline, { rethrow: (e) => /3036/.test(String(e)) })).rejects.toThrow(/3036/);
    expect(ai).toHaveBeenCalledTimes(1);
  });
});

describe("validatePlan", () => {
  it("accepts a good plan", () => {
    expect(validatePlan(PLAN).problems).toEqual([]);
  });
  it("catches replayed scenes, unknown kinds and places, reserved ids and a mystery solved too soon", () => {
    const bad = {
      ...PLAN,
      cast: [...PLAN.cast.slice(0, 2), { id: "dadi", name: "Dadi", kind: "dragon", trait: "x" }],
      mystery: { ...PLAN.mystery, payoffScene: 2 },
      scenes: [...PLAN.scenes.slice(0, 5), { ...PLAN.scenes[0]!, location: "moon" }],
    };
    const p = validatePlan(bad).problems.join(" | ");
    expect(p).toMatch(/cast id "dadi" must be a name in CAPITALS/);
    expect(p).toMatch(/kind "dragon"/);
    expect(p).toMatch(/scene 6 location "moon"/);
    expect(p).toMatch(/scenes 1 and 6 have the same beat/);
    expect(p).toMatch(/payoffScene at least two scenes later/);
  });
  it("rejects forbidden words anywhere in the plan", () => {
    expect(validatePlan({ ...PLAN, want: "Meena wants to catch the ghost." }).problems.join()).toMatch(/forbidden word \("ghost"\)/);
  });
});

describe("checkScenes", () => {
  it("needs the right scene marks and allows viewer questions only where planned", () => {
    const rows = fakeScenes("Write scenes 1, 2 now").filter((r) => r !== "SCENE: 2");
    expect(checkScenes(rows, [1, 2], PLAN, []).join(" ")).toMatch(/write exactly the rows SCENE: 1, SCENE: 2/);
    const extraQ = [...fakeScenes("Write scene 1 now"), "AJJA: And what would YOU pick? Hmm?"];
    expect(checkScenes(extraQ, [1], PLAN, []).join(" ")).toMatch(/asks the viewers 1 times here; only 0 allowed/);
  });
  it("flags a line that replays an earlier one", () => {
    const prior = ["SCENE: 1", "AJJA: Meena pulled the long rope out of the dry well slowly."];
    const rows = [...fakeScenes("Write scene 2 now"), "AJJA: Meena slowly pulled the long rope out of the dry well."];
    expect(checkScenes(rows, [2], PLAN, prior).join(" ")).toMatch(/repeats line 1/);
  });
});

describe("sceneBatches", () => {
  it("writes one scene per call by default, or groups them", () => {
    expect(sceneBatches(6)).toEqual([[1], [2], [3], [4], [5], [6]]);
    expect(sceneBatches(7, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });
});

describe("forgiving fixes", () => {
  it("reads number words in the plan and drops Ajja from the cast", () => {
    const loose = { ...PLAN, cast: [...PLAN.cast, { id: "AJJA", name: "Ajja", kind: "grandfather", trait: "wise" }], mystery: { ...PLAN.mystery, setupScene: "one", payoffScene: "four" } };
    const { plan, problems } = validatePlan(loose);
    expect(problems).toEqual([]);
    expect(plan!.cast.map((c) => c.id)).toEqual(["MEENA", "MOTI", "DADI"]);
    expect(plan!.mystery.payoffScene).toBe(4);
  });
  it("removes unknown and back-to-back cues instead of rejecting the scene", () => {
    expect(dropBadCues(["SCENE: 1", "SFX: bark", "SFX: wind", "AJJA: Woof!", "SFX: slurp", "KID: Yum!"])).toEqual(["SCENE: 1", "SFX: bark", "AJJA: Woof!", "KID: Yum!"]);
  });
});

describe("story window fits the scene window (no valid scenes thrown away at the join)", () => {
  it("six minimal scenes and eight maximal scenes both pass the joined checks", async () => {
    const { MIN_SCENE_LINES, MAX_SCENE_LINES, MIN_SCENE_WORDS, MAX_SCENE_WORDS, SCENES_MAX } = await import("../src/generate.ts");
    const { MAX_LINES_PER_CHAPTER } = await import("../src/story.ts");
    expect(SCENES_MAX * MAX_SCENE_LINES + 2).toBeLessThanOrEqual(MAX_LINES_PER_CHAPTER);
    for (const [count, lines, words] of [[6, MIN_SCENE_LINES, MIN_SCENE_WORDS], [8, MAX_SCENE_LINES, MAX_SCENE_WORDS]] as const) {
      const plan = { ...PLAN, scenes: Array.from({ length: count }, (_, i) => ({ ...PLAN.scenes[i % 6]!, beat: `${words} ${i} ${PLAN.scenes[i % 6]!.beat}` })), mystery: { ...PLAN.mystery, payoffScene: 4 } };
      const per = Math.floor(words / lines), extra = words - per * lines;
      const ai = vi.fn<AiRunner>(async (_m, input) => {
        const p = promptOf(input);
        if (/Plan it as JSON/.test(p)) return json(plan);
        const s = Number(p.match(/Write scene (\d+) now/)![1]);
        const rows = [`SCENE: ${s}`];
        for (let i = 0; i < lines; i++) rows.push(`${i === 3 ? "KID" : i % 2 ? "MEENA" : "AJJA"}: ${Array.from({ length: per + (i < extra ? 1 : 0) }, word).join(" ")}.`);
        return json({ lines: rows });
      });
      const out = await generateStory(ai, outline, { plan: plan as StoryPlan, maxAttempts: 1 });
      expect(out.lines.length).toBe(count * lines + 2);
    }
  });
});

describe("resuming a story across nights", () => {
  it("saves each accepted scene and picks up after the last saved one", async () => {
    const saved: string[][] = [];
    let calls = 0;
    const failAt3: AiRunner = async (_m, input) => {
      const p = promptOf(input);
      if (/Write scene 3 now/.test(p)) throw new Error("3036: neurons used up");
      calls++;
      return json({ lines: fakeScenes(p) });
    };
    await expect(generateStory(failAt3, outline, { plan: PLAN, onScene: async (rows) => { saved.push(rows); }, rethrow: (e) => /3036/.test(String(e)) })).rejects.toThrow(/3036/);
    expect(calls).toBe(2);
    const draft = saved.at(-1)!;
    expect(sceneMarks(draft.join("\n")).map((s) => s.n)).toEqual([1, 2]);
    // the next night: only scenes 3-6 are written
    const ai = fakeAi();
    const out = await generateStory(ai, outline, { plan: PLAN, draft });
    expect(ai).toHaveBeenCalledTimes(4);
    expect(promptOf(ai.mock.calls[0]![1])).toMatch(/Scenes 1 to 2 are ALREADY written[\s\S]*Write scene 3 now/);
    expect(sceneMarks(out.spoken).map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
