import { describe, expect, it } from "vitest";
import { parseDialogue, sfxCues, splitDialogue, validateChapterBody } from "../src/story.ts";

const base = [
  "AJJA: Meena ran to the river with her red kite.",
  "SFX: wind",
  "KID: Did the kite fly up high, Ajja?",
  "AJJA: Whoosh! It flew over the mango trees.",
  "SFX: birds",
  "KID: And the birds came to say hello!",
  "AJJA: Yes, they sang tweet-tweet all around her.",
  "AJJA: What would YOU do with a kite, hmm?",
];

describe("sound cues", () => {
  it("keeps cues out of the spoken lines", () => {
    expect(validateChapterBody(base.join("\n"))).toEqual([]);
    expect(splitDialogue(base.join("\n"))).toHaveLength(6);
    expect(parseDialogue(base.join("\n")).every(Boolean)).toBe(true);
  });
  it("places each cue before the next spoken line", () => {
    expect(sfxCues(base.join("\n"))).toEqual([{ id: "wind", before: 1 }, { id: "birds", before: 3 }]);
  });
  it("rejects unknown sounds and back-to-back cues", () => {
    expect(validateChapterBody([...base, "SFX: explosion"].join("\n")).join(" ")).toMatch(/unknown sound "explosion"/);
    expect(validateChapterBody([...base, "SFX: bell", "SFX: drum"].join("\n")).join(" ")).toMatch(/two sound cues in a row/);
  });
});

describe("banned words", () => {
  it("matches whole words only, so everyday words pass", () => {
    const ok = [...base, "KID: Hello Ajja, I have a new skill!", "AJJA: Turn the switch and see, the boy studied hard."];
    expect(validateChapterBody(ok.join("\n"))).toEqual([]);
  });
  it("still catches the real words and their endings", () => {
    expect(validateChapterBody([...base, "AJJA: The ghosts came out."].join("\n")).join(" ")).toMatch(/forbidden word \("ghosts"\)/);
    expect(validateChapterBody([...base, "KID: Who killed it?"].join("\n")).join(" ")).toMatch(/forbidden word \("killed"\)/);
  });
  it("rejects long lines", () => {
    const long = "AJJA: " + Array.from({ length: 21 }, () => "word").join(" ") + ".";
    expect(validateChapterBody([...base, long].join("\n")).join(" ")).toMatch(/too long \(21 words, max 20\)/);
  });
});
