// The nightly engine end to end, on a real SQLite (node:sqlite) standing in for D1, with R2 and
// Workers AI faked: legacy archive, plan + scene-by-scene writing, character voices, resuming.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { viewerQuestionScenes, type EpisodeOutline, type StoryPlan } from "@banyan/core";
import type { Env } from "../src/env.ts";
import { voiceNext } from "../src/voice-chapter.ts";

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    run: async () => { db.prepare(sql).run(...(args as never[])); return { success: true }; },
  });
  return { raw: db, prepare: (sql: string) => stmt(sql), batch: async (s: ReturnType<typeof stmt>[]) => { for (const x of s) await x.run(); return []; } };
}

function fakeR2() {
  const m = new Map<string, ArrayBuffer>();
  return {
    m,
    put: async (k: string, v: ArrayBuffer) => { m.set(k, v); },
    delete: async (k: string | string[]) => { for (const x of [k].flat()) m.delete(x); },
    list: async ({ prefix }: { prefix: string }) => ({ objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
  };
}

const PLAN: StoryPlan = {
  title: "Water for Moti", want: "Meena wants to help a thirsty puppy.",
  cast: [{ id: "MEENA", name: "Meena", kind: "girl", trait: "brave" }, { id: "MOTI", name: "Moti", kind: "dog", trait: "cheeky" }],
  chorus: "One more try, up goes the sky!",
  mystery: { question: "Who leaves wet paw prints?", answer: "Moti", setupScene: 1, payoffScene: 4 },
  scenes: [
    "Meena spots a panting puppy beside the dry well.",
    "Her little bucket on the short rope cannot reach water.",
    "A longer rope tangles and drops into the mud.",
    "Grandmother remembers how children once made a chain of hands.",
    "Friends join hands and the bucket finally fills.",
    "The lane celebrates and the puppy becomes its guard.",
  ].map((beat) => ({ location: "village-lane" as const, cast: ["MEENA", "MOTI"], beat, funny: "Moti sneezes", mood: "playful" as const })),
};

const SYL = ["ka", "lo", "mi", "ra", "su", "te", "no", "vi"];
let n = 0;
const word = () => { const i = n++; return SYL[i % 8]! + SYL[(i >> 3) % 8] + SYL[(i >> 6) % 8] + SYL[(i >> 9) % 8]; };
function scene(s: number): string[] {
  const rows = [`SCENE: ${s}`];
  for (let i = 0; i < 12; i++) rows.push(`${i === 5 ? "KID" : i % 3 === 1 ? "MEENA" : "AJJA"}: ${Array.from({ length: 10 }, word).join(" ")}.`);
  if (viewerQuestionScenes(6).includes(s)) rows.push("AJJA: What would YOU do for a thirsty puppy? Hmm?");
  return rows;
}

function fakeAi(opts: { neuronsOutAtScene?: number } = {}) {
  const calls: string[] = [];
  const run = async (model: string, input: Record<string, unknown>, o?: { returnRawResponse?: boolean }) => {
    if (o?.returnRawResponse) {
      calls.push(`tts:${input.speaker}`);
      return new Response(new Uint8Array(6000), { headers: { "content-type": "audio/mpeg" } });
    }
    const p = (input.messages as { content: string }[]).map((m) => m.content).join("\n");
    if (/Plan it as JSON/.test(p)) { calls.push("plan"); return { response: JSON.stringify(PLAN) }; }
    const s = Number(p.match(/Write scene (\d+) now/)![1]);
    if (s === opts.neuronsOutAtScene) throw new Error("3036: you have used up your daily free allocation of 10,000 neurons");
    calls.push(`scene:${s}`);
    return { response: JSON.stringify({ lines: scene(s) }) };
  };
  return { calls, run };
}

function makeEnv(ai: ReturnType<typeof fakeAi>) {
  const DB = fakeD1();
  const env = { DB, BUCKET: fakeR2(), AI: { run: ai.run }, PUBLIC_BASE: "https://x.test", CF_ACCOUNT_ID: "a" } as unknown as Env;
  return { env, DB };
}
const outlineOf = (DB: ReturnType<typeof fakeD1>, id: string) => JSON.parse((DB.raw.prepare("SELECT outline_json FROM episodes WHERE id = ?").get(id) as { outline_json: string }).outline_json) as EpisodeOutline;

describe("voiceNext (nightly engine)", () => {
  it("archives a legacy episode, starts a story, plans and writes it, voices characters in their own voices", async () => {
    const ai = fakeAi();
    const { env, DB } = makeEnv(ai);
    await voiceNext(env); // creates the schema and the first story (no legacy yet)
    // a legacy 8-chapter episode, older than the story, still voicing
    DB.raw.prepare("INSERT INTO episodes (id, title, theme_id, kind, status, outline_json, created_at, updated_at) VALUES ('old', 'Old', 'honesty', 'folk-tale', 'chapter-pending', '{\"chapters\":[]}', '2026-10-01', '2026-10-01')").run();
    DB.raw.prepare("INSERT INTO chapters (episode_id, idx, title, updated_at) VALUES ('old', 3, 'Chapter 4', '2026-10-01')").run();
    const night1 = await voiceNext(env);
    expect(night1).toMatch(/^archived legacy 8-chapter episode old; voiced e\w+ #0 \(\d+\/\d+, resumes tomorrow\)$/);
    expect((DB.raw.prepare("SELECT status FROM episodes WHERE id = 'old'").get() as { status: string }).status).toBe("archived");
    const story = (DB.raw.prepare("SELECT id FROM episodes WHERE id != 'old'").get() as { id: string }).id;
    const o = outlineOf(DB, story);
    expect(o.plan?.title).toBe("Water for Moti");
    expect(o.draft).toBeUndefined();
    expect(ai.calls.filter((c) => c === "plan")).toHaveLength(1);
    expect(ai.calls.filter((c) => c.startsWith("scene:"))).toEqual(["scene:1", "scene:2", "scene:3", "scene:4", "scene:5", "scene:6"]);
    // Meena speaks in the girl's voice, and her clips carry her pitch
    expect(ai.calls).toContain("tts:phoebe");
    const ch = DB.raw.prepare("SELECT spoken, clips_json, status FROM chapters WHERE episode_id = ?").get(story) as { spoken: string; clips_json: string; status: string };
    expect(ch.spoken).toMatch(/^SCENE: 6$/m);
    const clips = JSON.parse(ch.clips_json) as { speaker: string; pitch?: number }[];
    expect(clips.find((c) => c.speaker === "MEENA")?.pitch).toBe(1.2);
    expect(clips.find((c) => c.speaker === "AJJA")?.pitch).toBeUndefined();
    // night 2 re-reads the stored script with the cast's speakers and finishes voicing
    let night = "";
    for (let i = 0; i < 5 && !/\(\d+ lines\)$/.test(night); i++) night = await voiceNext(env);
    expect(night).toMatch(/^voiced e\w+ #0 \(\d+ lines\)$/);
    expect(ai.calls.filter((c) => c === "plan")).toHaveLength(1); // never re-planned
    expect((DB.raw.prepare("SELECT status FROM episodes WHERE id = ?").get(story) as { status: string }).status).toBe("pending");
  });

  it("keeps the scenes written before a neuron pause and resumes after them", async () => {
    const out = fakeAi({ neuronsOutAtScene: 4 });
    const { env, DB } = makeEnv(out);
    await voiceNext(env); // outline
    const paused = await voiceNext(env);
    expect(paused).toMatch(/paused-neurons scripting .* \(draft saved\)/);
    const story = (DB.raw.prepare("SELECT id FROM episodes").get() as { id: string }).id;
    expect(outlineOf(DB, story).draft?.filter((r) => r.startsWith("SCENE:"))).toEqual(["SCENE: 1", "SCENE: 2", "SCENE: 3"]);
    // next night: same database, neurons back; only scenes 4-6 are written
    const ai = fakeAi();
    (env as unknown as { AI: unknown }).AI = { run: ai.run };
    await voiceNext(env);
    expect(ai.calls.filter((c) => !c.startsWith("tts"))).toEqual(["scene:4", "scene:5", "scene:6"]);
    expect(outlineOf(DB, story).draft).toBeUndefined();
  });
});
