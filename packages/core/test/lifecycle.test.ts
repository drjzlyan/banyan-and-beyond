import { describe, expect, it } from "vitest";
import { assetKeyFromUrl, chapterStamps, checkStatusChange, contentRange, isChapterVoiced, shortHash } from "../src/lifecycle.ts";

describe("status changes", () => {
  const all = { renderedChapters: 8, totalChapters: 8 };
  it("approves only when every chapter has video", () => {
    expect(checkStatusChange("pending", "approved", all)).toBeNull();
    expect(checkStatusChange("pending", "approved", { renderedChapters: 7, totalChapters: 8 })).toMatch(/7\/8/);
  });
  it("refuses approval while voicing or after publishing", () => {
    expect(checkStatusChange("chapter-pending", "approved", all)).toMatch(/voiced/);
    expect(checkStatusChange("uploading", "approved", all)).toMatch(/uploading/);
    expect(checkStatusChange("posted", "approved", all)).toMatch(/posted/);
  });
  it("un-approves only from approved", () => {
    expect(checkStatusChange("approved", "pending", all)).toBeNull();
    expect(checkStatusChange("posted", "pending", all)).not.toBeNull();
  });
  it("never lets the Studio set uploading or posted by hand", () => {
    expect(checkStatusChange("approved", "posted", all)).not.toBeNull();
    expect(checkStatusChange("approved", "uploading", all)).not.toBeNull();
  });
});

describe("chapter state", () => {
  it("treats legacy rendered rows as voiced", () => {
    expect(isChapterVoiced("voiced")).toBe(true);
    expect(isChapterVoiced("rendered")).toBe(true);
    expect(isChapterVoiced("chapter-pending")).toBe(false);
  });
});

describe("chapter stamps", () => {
  it("prefers the rendered length, then voiced length, then a fallback", () => {
    const s = chapterStamps([
      { title: "A", video_duration: 400.4, duration: 380 },
      { title: "B", video_duration: null, duration: 300 },
      { title: "C" },
      { title: "D" },
    ]);
    expect(s.map((x) => x.start)).toEqual([0, 400, 700, 1150]);
  });
});

describe("content range", () => {
  it("returns null for the whole object", () => {
    expect(contentRange(undefined, 100)).toBeNull();
    expect(contentRange({ offset: 0, length: 100 }, 100)).toBeNull();
    expect(contentRange({ offset: 0 }, 100)).toBeNull();
  });
  it("handles offset/length, open-ended and suffix ranges", () => {
    expect(contentRange({ offset: 10, length: 20 }, 100)).toMatchObject({ start: 10, end: 29, length: 20, header: "bytes 10-29/100" });
    expect(contentRange({ offset: 90 }, 100)).toMatchObject({ start: 90, end: 99, length: 10 });
    expect(contentRange({ suffix: 5 }, 100)).toMatchObject({ start: 95, end: 99, header: "bytes 95-99/100" });
    expect(contentRange({ offset: 90, length: 50 }, 100)).toMatchObject({ end: 99, length: 10 });
  });
});

describe("asset keys", () => {
  it("hashes deterministically and differs by text", () => {
    expect(shortHash("hello")).toBe(shortHash("hello"));
    expect(shortHash("hello")).not.toBe(shortHash("hello!"));
  });
  it("recovers the R2 key from a public URL", () => {
    expect(assetKeyFromUrl("https://x.app/assets/episodes/e1/ch-0.mp4")).toBe("episodes/e1/ch-0.mp4");
    expect(assetKeyFromUrl("blob:abc")).toBeNull();
  });
});
