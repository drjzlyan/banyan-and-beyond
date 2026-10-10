import { describe, expect, it } from "vitest";
import { buildOutline, selectTheme } from "../src/selection.ts";
import { themeById } from "../src/themes.ts";
import { formatTimestamp, youtubeDescription, youtubeTitle } from "../src/youtube.ts";
import { layoutLines, planLineClips, speakerFor, splitNightlyShare, AJJA_SPEAKER, KID_SPEAKER } from "../src/voices.ts";
import { validateChapterBody } from "../src/story.ts";

describe("selection", () => {
  it("rotates kinds and respects cooldown", () => {
    const a = selectTheme([], []);
    const b = selectTheme([a.theme.id], [a.kind]);
    expect(b.kind).not.toBe(a.kind);
    expect(b.theme.id).not.toBe(a.theme.id);
  });
  it("builds 8 chapter beats", () => {
    const theme = themeById("honesty")!;
    const o = buildOutline(theme, "folk-tale");
    expect(o.chapters).toHaveLength(8);
    expect(o.title).toContain("Honesty");
  });
});

describe("story validator", () => {
  const good = ["AJJA: Come sit with me, little one.", "KID: Ajja, what is honesty?", "AJJA: Honesty is telling the truth with love.", "KID: Even when I feel afraid to speak?", "AJJA: Yes, courage helps honesty grow strong.", "KID: I will try to be honest today."].join("\n");
  it("accepts a good chapter head", () => {
    expect(validateChapterBody(good)).toEqual([]);
  });
  it("rejects digits, bad speakers, banned words", () => {
    expect(validateChapterBody("AJJA: I have 3 mangoes")).toContainEqual(expect.stringContaining("digits"));
    expect(validateChapterBody("NARRATOR: hello")).toContainEqual(expect.stringContaining("AJJA: or KID:"));
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
    const d = youtubeDescription("T", [{ title: "Chapter 1", start: 0 }], "Be kind.");
    expect(d).toContain("0:00");
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
