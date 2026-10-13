import { describe, expect, it } from "vitest";
import { INTRO_FIRST_SECONDS, INTRO_STING_SECONDS, LINE_GAP, OUTRO_FINAL_SECONDS, TAIL_SECONDS, chapterRole, pauseAfter, totalPauses, withBookends } from "../src/timeline.ts";

const clip = (start: number, end: number) => ({ speaker: "AJJA", start, end, words: [{ text: "hi", start, end }] });

describe("chapter bookends", () => {
  it("gives chapter 1 the jingle, the last chapter the outro, the rest a sting and a tail", () => {
    expect([0, 1, 6, 7].map((i) => chapterRole(i, 8))).toEqual(["first", "middle", "middle", "final"]);
    const first = withBookends([clip(0, 2)], [{ at: 1 }], 10, "first");
    expect(first.clips[0]).toMatchObject({ start: INTRO_FIRST_SECONDS, end: INTRO_FIRST_SECONDS + 2 });
    expect(first.clips[0]!.words![0]!.start).toBe(INTRO_FIRST_SECONDS);
    expect(first.cues[0]!.at).toBe(INTRO_FIRST_SECONDS + 1);
    expect(first.duration).toBe(INTRO_FIRST_SECONDS + 10 + TAIL_SECONDS);
    expect(withBookends([clip(0, 2)], [], 10, "middle").duration).toBe(INTRO_STING_SECONDS + 10 + TAIL_SECONDS);
    const fin = withBookends([clip(0, 2)], [], 10, "final");
    expect(fin).toMatchObject({ duration: INTRO_STING_SECONDS + 10 + OUTRO_FINAL_SECONDS, outro: OUTRO_FINAL_SECONDS });
  });
});

describe("pauseAfter", () => {
  const A = (text: string) => ({ speaker: "AJJA", text });
  const K = (text: string) => ({ speaker: "KID", text });
  it("waits for the children after a question to them", () => {
    expect(pauseAfter(A("What would YOU do if your friend had no kite?"), K("I would share!"))).toBeGreaterThan(1);
    expect(pauseAfter(A("Hmm?"), K("Share!"))).toBeGreaterThan(1);
  });
  it("holds a breath before a reveal, and keeps quick banter moving", () => {
    expect(pauseAfter(A("And inside the box there was..."), A("a tiny puppy!"))).toBeGreaterThan(LINE_GAP);
    expect(pauseAfter(K("Was it a puppy?"), A("Yes, a puppy!"))).toBeLessThan(LINE_GAP);
    expect(pauseAfter(A("Meena ran all the way to the river bank."), A("The water was cold."))).toBe(LINE_GAP);
  });
  it("adds no pause after the last line, and totals for estimates", () => {
    expect(totalPauses([A("One."), A("Two.")])).toBe(LINE_GAP);
    expect(totalPauses([])).toBe(0);
  });
});
