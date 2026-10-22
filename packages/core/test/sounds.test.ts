import { describe, expect, it } from "vitest";
import { SFX, SFX_IDS, cueRelevant, triggerWord, tuneCues } from "../src/sounds.ts";
import { parseScript, storyProblems, stripStageDirections } from "../src/story.ts";
import { CAST_KINDS } from "../src/world.ts";

const rowsOf = (s: string[]) => parseScript(s.join("\n")).filter(Boolean) as Parameters<typeof tuneCues>[0];
const back = (rows: ReturnType<typeof tuneCues>["rows"]) => rows.map((r) => (r.kind === "sfx" ? `SFX: ${r.id}` : r.kind === "scene" ? `SCENE: ${r.n}` : `${r.speaker}: ${r.text}`));

describe("sound choice", () => {
  it("every character kind's sound exists", () => {
    for (const k of Object.values(CAST_KINDS)) if (k.sound) expect(SFX_IDS).toContain(k.sound);
  });
  it("keeps a cue only when its line (or the next) is about it", () => {
    // the live script's misfires: splash before a cow moos, drum before Meena speaks
    expect(cueRelevant("splash", "Gopal lowered his head and mooed softly.")).toBe(false);
    expect(cueRelevant("drum", "Meena stepped forward, eyes bright.")).toBe(false);
    expect(cueRelevant("moo", "Gopal the cow lowered his head.")).toBe(true);
    expect(cueRelevant("splash", "Raju looked around.", "Then he jumped in the pond!")).toBe(true);
  });
  it("lands overlay sounds on the word that triggers them", () => {
    expect(SFX.boing.kind).toBe("overlay");
    expect(triggerWord("boing", "The rabbit hopped over the log.")).toBe(2);
    expect(triggerWord("slip", "Oops! Raju slipped on the peel.")).toBe(0);
    expect(triggerWord("knock", "Nobody was home.")).toBe(-1);
  });
  it("drops filler cues, adds cues the words call for, and gives an animal its sound once", () => {
    const { rows, dropped } = tuneCues(rowsOf([
      "SCENE: 1",
      "SFX: drum",
      "AJJA: Meena stepped forward with a smile.",
      "AJJA: Gauri the cow walked into the lane.",
      "MEENA: Hello Gauri, are you hungry today?",
      "AJJA: Then Meena slipped on a mango peel.",
      "KID: Oh no, poor Meena!",
      "AJJA: Gauri came back to the lane again.",
      "AJJA: Everyone laughed and clapped for her.",
    ]), { animals: [{ name: "Gauri", sound: "moo" }] });
    expect(dropped).toEqual([expect.stringMatching(/^drum before "Meena stepped/)]);
    const out = back(rows);
    expect(out.filter((r) => r === "SFX: moo")).toHaveLength(1);
    expect(out[out.indexOf("AJJA: Gauri the cow walked into the lane.") - 1]).toBe("SFX: moo");
    expect(out[out.indexOf("AJJA: Then Meena slipped on a mango peel.") - 1]).toBe("SFX: slip");
    // never two cues in a row, and not too close together
    expect(out.some((r, i) => r.startsWith("SFX") && out[i + 1]?.startsWith("SFX"))).toBe(false);
  });
});

describe("storyProblems (the failures of the 2026-10-20 live script)", () => {
  it("catches the Kid narrating, abstract metaphors and replayed lines", () => {
    const p = storyProblems([
      { speaker: "AJJA", text: "Raju climbed high but his foot slipped on the bark." },
      { speaker: "KID", text: "I tried to catch it, but slipped on wet grass." },
      { speaker: "AJJA", text: "Honesty shines bright, like sunshine on mangoes." },
      { speaker: "AJJA", text: "Raju climbed high, but his foot slipped on the bark again." },
    ]).join(" | ");
    expect(p).toMatch(/line 2: the Kid is listening/);
    expect(p).toMatch(/line 3 uses an abstract comparison/);
    expect(p).toMatch(/line 4 repeats line 1/);
  });
  it("lets the chorus and the viewer question come back, but caps the questions", () => {
    const lines = [
      { speaker: "MEENA", text: "One more try, up goes the sky!" },
      { speaker: "AJJA", text: "What would YOU do now? Hmm?" },
      { speaker: "MOTI", text: "One more try, up goes the sky!" },
      { speaker: "AJJA", text: "What would YOU do now? Hmm?" },
    ];
    expect(storyProblems(lines, { chorus: "One more try, up goes the sky!" })).toEqual([]);
    expect(storyProblems([...lines, ...lines], { chorus: "One more try, up goes the sky!" }).join()).toMatch(/asks the viewers 4 times; at most 3/);
  });
});

describe("no sound spam", () => {
  it("keeps the same sound from coming back too soon or too often", () => {
    const rows = ["SCENE: 1"];
    for (let i = 0; i < 30; i++) rows.push("SFX: bark", `KUKU: Woof! I am line ${["one", "two", "three"][i % 3]} of many.`);
    const out = back(tuneCues(rowsOf(rows)).rows);
    const barks = out.map((r, i) => (r === "SFX: bark" ? i : -1)).filter((i) => i >= 0);
    expect(barks.length).toBeLessThanOrEqual(3);
    expect(barks.length).toBeGreaterThan(1);
  });
  it("strips stage directions TTS would read aloud, and flags value similes", () => {
    expect(stripStageDirections("I can be a rope! *whistles* Look!")).toBe("I can be a rope! Look!");
    expect(stripStageDirections("Oh (laughs) yes")).toBe("Oh yes");
    expect(storyProblems([{ speaker: "ANJALI", text: "Kindness pours like rain, and we all feel happy." }]).join()).toMatch(/abstract comparison/);
    expect(storyProblems([{ speaker: "GITA", text: "Your arm wobbles like a spaghetti noodle, Ravi!" }])).toEqual([]);
  });
});
