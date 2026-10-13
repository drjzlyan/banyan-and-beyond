import { describe, expect, it } from "vitest";
import { analyzeChapter } from "../src/analysis.ts";
import { DEFAULT_VOICE_SETTINGS, mergeVoiceSettings, voiceFor } from "../src/voices.ts";

const script = [
  "AJJA: Come sit with me under the banyan, little one, the breeze is soft tonight.",
  "KID: Ajja, what story will you tell me tonight under the stars?",
  "AJJA: Tomorrow night the farmer will come, and I will tell you his story.",
  "AJJA: The river ran clear and the children played by its gentle bank.",
  "KID: Did they share their mangoes with the little puppy too?",
  "AJJA: They did, and tomorrow I will tell you what the puppy found.",
].join("\n");

describe("analyzeChapter", () => {
  it("counts lines, words and speakers", () => {
    const a = analyzeChapter(script);
    expect(a.lines).toBe(6);
    expect(a.kidLines).toBe(2);
    expect(a.ajjaLines).toBe(4);
    expect(a.secondsEstimated).toBe(true);
    expect(a.problems).toEqual([]);
  });
  it("flags more than one hook, and a short chapter", () => {
    const a = analyzeChapter(script);
    expect(a.hookLines).toEqual([3, 6]);
    expect(a.warnings.join(" ")).toMatch(/2 "tomorrow" hooks/);
    expect(a.warnings.join(" ")).toMatch(/runs about/);
  });
  it("uses real clip durations and stretches them by pitch", () => {
    const clipDurations = [4, 3, 4, 4, 3, 4].map((d, i) => ({ speaker: i === 1 || i === 4 ? "KID" : "AJJA", duration: d }));
    const a = analyzeChapter(script, { clipDurations, ajjaPitch: 0.8, kidPitch: 1 });
    expect(a.secondsEstimated).toBe(false);
    expect(a.seconds).toBeCloseTo(22 + 5 * 0.35);
    expect(a.pitchedSeconds).toBeCloseTo(16 / 0.8 + 6 + 5 * 0.35);
  });
  it("reports an empty chapter", () => {
    expect(analyzeChapter("").problems).toEqual(["no script yet"]);
  });
});

describe("voice settings", () => {
  it("accepts known voices and in-range pitches", () => {
    const { settings, errors } = mergeVoiceSettings(DEFAULT_VOICE_SETTINGS, { ajjaVoice: "pluto", kidPitch: 1.234 });
    expect(errors).toEqual([]);
    expect(settings.ajjaVoice).toBe("pluto");
    expect(settings.kidPitch).toBe(1.23);
    expect(voiceFor("AJJA", settings)).toBe("pluto");
    expect(voiceFor("KID", settings)).toBe(DEFAULT_VOICE_SETTINGS.kidVoice);
  });
  it("rejects unknown voices and wild pitches", () => {
    const { settings, errors } = mergeVoiceSettings(DEFAULT_VOICE_SETTINGS, { ajjaVoice: "angus", kidPitch: 3 });
    expect(errors).toHaveLength(2);
    expect(settings).toEqual(DEFAULT_VOICE_SETTINGS);
  });
});
