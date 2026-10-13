import { describe, expect, it, vi } from "vitest";
import { buildOutline } from "../src/selection.ts";
import { themeById } from "../src/themes.ts";
import { generateChapter, MAX_CHAPTER_WORDS, MIN_CHAPTER_WORDS } from "../src/generate.ts";
import type { AiRunner } from "../src/ai.ts";

const outline = buildOutline(themeById("kindness")!, "village-story");

/** A valid ~320-word half: 16 lines x 20 words (no digits — the validator forbids them). */
const POOL = "the old banyan tree gives cool shade while kind children listen softly every evening".split(" ");
function makeHalf(totalLines = 16, wordsPerLine = 20): string[] {
  const words = Array.from({ length: wordsPerLine }, (_, i) => POOL[i % POOL.length]).join(" ");
  const rows = Array.from({ length: totalLines }, (_, i) => `${i % 4 === 3 ? "KID" : "AJJA"}: ${words}.`);
  rows.splice(5, 0, "SFX: birds"); // a sound cue, which is never spoken
  return rows;
}

const resultFor = (lines: string[]) => ({ lines });
const PRIMARY = "@cf/openai/gpt-oss-120b";
const FALLBACK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

describe("generateChapter (two halves)", () => {
  it("writes two halves and prepends the intro on chapter 0", async () => {
    const ai: AiRunner = vi.fn(async () => resultFor(makeHalf()));
    const out = await generateChapter(ai, outline, 0, { maxAttempts: 2 });
    expect(ai).toHaveBeenCalledTimes(3);
    expect(out.attempts).toBe(3);
    // cues stay in the script but are not spoken lines
    expect(out.spoken).toMatch(/^SFX: birds$/m);
    expect(out.lines.every((l) => l.speaker === "AJJA" || l.speaker === "KID")).toBe(true);
    expect(out.words).toBeGreaterThanOrEqual(MIN_CHAPTER_WORDS);
    expect(out.words).toBeLessThanOrEqual(MAX_CHAPTER_WORDS);
    expect(out.spoken.split("\n")[0]).toMatch(/^AJJA: Namaste little friends/);
    expect((ai as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(PRIMARY);
    // the second half sees the first half's lines
    const secondInput = (ai as ReturnType<typeof vi.fn>).mock.calls[1][1] as { messages: { content: string }[] };
    expect(secondInput.messages.map((m) => m.content).join(" ")).toMatch(/Continue the SAME scene/);
    // only the second half may end on the "tomorrow" hook; the first must not greet again
    const firstInput = (ai as ReturnType<typeof vi.fn>).mock.calls[0][1] as { messages: { content: string }[] };
    const first = firstInput.messages.map((m) => m.content).join(" ");
    expect(first).toMatch(/Do not mention tomorrow/);
    expect(first).toMatch(/do not welcome or greet them again/);
    // middle part: no hook yet; only the last part ends on the "tomorrow" hook
    expect(secondInput.messages.map((m) => m.content).join(" ")).toMatch(/Do not mention tomorrow/);
    const lastInput = (ai as ReturnType<typeof vi.fn>).mock.calls[2][1] as { messages: { content: string }[] };
    expect(lastInput.messages.map((m) => m.content).join(" ")).toMatch(/LAST line, and only your last line/);
  });

  it("appends the outro on the final chapter", async () => {
    const ai: AiRunner = vi.fn(async () => resultFor(makeHalf()));
    const out = await generateChapter(ai, outline, 7, { maxAttempts: 1 });
    const rows = out.spoken.split("\n");
    expect(rows[rows.length - 1]).toMatch(/^AJJA: Tell someone you love/);
  });

  it("retries a bad half with validator feedback and still joins", async () => {
    const bad = ["AJJA: I have 3 mangoes.", "KID: Oh."];
    const ai: AiRunner = vi.fn()
      .mockResolvedValueOnce(resultFor(bad))
      .mockResolvedValueOnce(resultFor(makeHalf()))
      .mockResolvedValueOnce(resultFor(makeHalf()))
      .mockResolvedValueOnce(resultFor(makeHalf()));
    const out = await generateChapter(ai, outline, 3, { maxAttempts: 3 });
    expect(out.attempts).toBe(4);
    const retryInput = (ai as ReturnType<typeof vi.fn>).mock.calls[1][1] as { messages: { content: string }[] };
    expect(retryInput.messages.map((m) => m.content).join(" ")).toMatch(/rejected/);
  });

  it("uses the fallback model on the last attempt of a half", async () => {
    const short = ["AJJA: Hello there friend.", "KID: Hello Ajja, tell me more please."];
    const calls: string[] = [];
    const ai: AiRunner = async (model, input) => {
      calls.push(model);
      void input;
      return resultFor(short);
    };
    await expect(generateChapter(ai, outline, 2, { maxAttempts: 3 })).rejects.toThrow(/chapter part 1 failed after 3 attempts/);
    expect(calls).toEqual([PRIMARY, PRIMARY, FALLBACK]);
  });

  it("treats request errors as retryable feedback", async () => {
    const ai: AiRunner = vi.fn()
      .mockRejectedValueOnce(new Error("Workers AI 500 boom"))
      .mockResolvedValueOnce(resultFor(makeHalf()))
      .mockResolvedValueOnce(resultFor(makeHalf()))
      .mockResolvedValueOnce(resultFor(makeHalf()));
    const out = await generateChapter(ai, outline, 4, { maxAttempts: 2 });
    expect(out.attempts).toBe(4);
  });
});
