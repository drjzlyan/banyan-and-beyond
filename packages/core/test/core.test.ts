import { describe, expect, it } from "vitest";
import { buildOutline, selectTheme } from "../src/selection.ts";
import { PREMISES, selectPremise } from "../src/premises.ts";
import { themeById } from "../src/themes.ts";
import { formatTimestamp, youtubeDescription, youtubeTitle } from "../src/youtube.ts";
import { layoutLines, planLineClips, speakerFor, splitNightlyShare, AJJA_SPEAKER, KID_SPEAKER, AURA2_VOICES, DEFAULT_VOICE_SETTINGS, mergeVoiceSettings, pitchFor, voiceFor } from "../src/voices.ts";
import { CAST_KINDS } from "../src/world.ts";
import type { StoryPlan } from "../src/types.ts";
import { validateChapterBody } from "../src/story.ts";

describe("selection", () => {
  it("rotates kinds and respects cooldown", () => {
    const a = selectTheme([], []);
    const b = selectTheme([a.theme.id], [a.kind]);
    expect(b.kind).not.toBe(a.kind);
    expect(b.theme.id).not.toBe(a.theme.id);
  });
  it("builds one standalone story seeded with a premise", () => {
    const theme = themeById("honesty")!;
    const premise = selectPremise(theme.id, []);
    const o = buildOutline(theme, "folk-tale", premise);
    expect(o.format).toBe("story");
    expect(o.chapters).toHaveLength(1);
    expect(o.premiseId).toBe(premise.id);
    expect(o.title).toBe(premise.title);
    expect(o.chapters[0]!.beat).toBe(premise.plot);
    expect(buildOutline(theme, "folk-tale").title).toContain("Honesty");
  });
  it("rotates premises within a theme, least recently used first", () => {
    const first = selectPremise("kindness", []);
    const second = selectPremise("kindness", [first.id]);
    expect(second.theme).toBe("kindness");
    expect(second.id).not.toBe(first.id);
    // every theme has premises, and every premise names a real theme
    for (const t of ["honesty", "kindness", "duty", "courage", "respect", "sharing", "cleanliness", "gratitude"]) expect(PREMISES.some((p) => p.theme === t)).toBe(true);
    expect(PREMISES.every((p) => themeById(p.theme))).toBe(true);
  });
});

describe("story validator", () => {
  const good = ["AJJA: Come sit with me, little one.", "KID: Ajja, what is honesty?", "AJJA: Honesty is telling the truth with love.", "KID: Even when I feel afraid to speak?", "AJJA: Yes, courage helps honesty grow strong.", "KID: I will try to be honest today."].join("\n");
  it("accepts a good chapter head", () => {
    expect(validateChapterBody(good)).toEqual([]);
  });
  it("rejects digits, bad speakers, banned words", () => {
    expect(validateChapterBody("AJJA: I have 3 mangoes")).toContainEqual(expect.stringContaining("digits"));
    expect(validateChapterBody("NARRATOR: hello")).toContainEqual(expect.stringContaining("unknown speaker NARRATOR"));
    expect(validateChapterBody("narrator says hello")).toContainEqual(expect.stringContaining("must start with a speaker tag"));
    // a story character is allowed once the plan lists it
    expect(validateChapterBody(`${good}\nMEENA: I found it!`, { speakers: ["MEENA"] })).toEqual([]);
    const bad = ["AJJA: Do not be afraid.", "KID: Was there a ghost?"].join("\n");
    expect(validateChapterBody(bad).join(" ")).toMatch(/forbidden/);
  });
  it("requires both speakers", () => {
    expect(validateChapterBody("AJJA: Only me speaking here friend.").join(" ")).toMatch(/Kid/);
  });
});

describe("voices timeline", () => {
  it("lays out clips sequentially with pauses", () => {
    const { clips, duration } = layoutLines([
      { speaker: "AJJA", text: "Hello little one", duration: 2 },
      { speaker: "KID", text: "Hello Ajja", duration: 1 },
    ]);
    expect(clips[0].start).toBe(0);
    expect(clips[1].start).toBeGreaterThan(2);
    expect(duration).toBeGreaterThan(3);
  });
  it("keeps unchanged lines on edit", () => {
    const plan = planLineClips(
      [{ speaker: "AJJA", text: "Hello", start: 0, end: 1 }],
      "AJJA: Hello\nKID: Hi Ajja",
    );
    expect(plan[0].keep).not.toBeNull();
    expect(plan[1].keep).toBeNull();
  });
});

describe("youtube helpers", () => {  it("formats timestamps", () => {
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3665)).toBe("1:01:05");
  });
  it("builds title and description", () => {
    expect(youtubeTitle("The Banyan Tale of Honesty")).toContain("Banyan and Beyond");
    const d = youtubeDescription("T", [{ title: "Chapter 1", start: 0 }, { title: "Chapter 2", start: 300 }], "Be kind.");
    expect(d).toContain("0:00");
    expect(d).toContain("5:00 Chapter 2");
    // a standalone story has no chapter list
    expect(youtubeDescription("T", [{ title: "The story", start: 0 }], "Be kind.")).not.toMatch(/Chapters:/);
  });
});

describe("character voices", () => {
  const plan = { cast: [{ id: "MEENA", name: "Meena", kind: "girl", trait: "brave" }, { id: "GAURI", name: "Gauri", kind: "cow", trait: "slow" }] } as unknown as StoryPlan;
  it("gives each character its kind's voice and pitch, and the owner can override a kind", () => {
    const s = DEFAULT_VOICE_SETTINGS;
    expect(voiceFor("AJJA", s, plan)).toBe(s.ajjaVoice);
    expect(voiceFor("KID", s, plan)).toBe(s.kidVoice);
    expect(voiceFor("MEENA", s, plan)).toBe(CAST_KINDS.girl.voice);
    expect(pitchFor("GAURI", s, plan)).toBe(CAST_KINDS.cow.pitch);
    const { settings, errors } = mergeVoiceSettings(s, { cast: { cow: { voice: "zeus", pitch: 0.75 } } });
    expect(errors).toEqual([]);
    expect(voiceFor("GAURI", settings, plan)).toBe("zeus");
    expect(mergeVoiceSettings(s, { cast: { dragon: { voice: "zeus", pitch: 1 }, cow: { voice: "nobody", pitch: 1 } } }).errors).toHaveLength(2);
  });
  it("no character voice collides with Ajja's or the Kid's", () => {
    const used = Object.values(CAST_KINDS).map((k) => k.voice);
    expect(used).not.toContain(DEFAULT_VOICE_SETTINGS.ajjaVoice);
    expect(used).not.toContain(DEFAULT_VOICE_SETTINGS.kidVoice);
    for (const v of used) expect(AURA2_VOICES).toContain(v);
  });
});

describe("nightly voicing", () => {
  it("maps speakers to Aura voices", () => {
    expect(speakerFor("AJJA")).toBe(AJJA_SPEAKER);
    expect(speakerFor("KID")).toBe(KID_SPEAKER);
  });
  it("splits lines into tonight's budget share and the remainder", () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({ speaker: "AJJA" as const, text: "a".repeat(200) }));
    const { tonight, later } = splitNightlyShare(lines);
    expect(tonight.length).toBeGreaterThan(0);
    expect(tonight.length + later.length).toBe(30);
    expect(tonight.join(" ").length).toBeLessThanOrEqual(3000 + 200);
    expect(tonight.length).toBeLessThan(30);
  });
  it("always voices at least one line", () => {
    const { tonight } = splitNightlyShare([{ speaker: "KID", text: "b".repeat(9000) }]);
    expect(tonight).toHaveLength(1);
  });
});
