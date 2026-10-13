import { describe, expect, it } from "vitest";
import {
  parseUploadResponse,
  parseVideoState,
  videoOutcome,
  resumableInitRequest,
  setThumbnailRequest,
  tokenRefreshRequest,
  uploadChunkRequest,
  videoStatusRequest,
} from "../src/youtube-upload.ts";

describe("youtube-upload builders", () => {
  it("builds a refresh request without leaking secrets into the URL", () => {
    const r = tokenRefreshRequest("cid", "csecret", "rtok");
    expect(r.url).toBe("https://oauth2.googleapis.com/token");
    expect(r.init.body).toContain("grant_type=refresh_token");
    expect(r.url).not.toContain("csecret");
  });
  it("builds a resumable init marked made-for-kids, default unlisted", () => {
    const r = resumableInitRequest("at", { title: "T", description: "D" });
    const body = JSON.parse(r.init.body as string);
    expect(body.status.privacyStatus).toBe("unlisted");
    expect(body.status.selfDeclaredMadeForKids).toBe(true);
    expect(body.snippet.categoryId).toBe("27");
  });
  it("builds ranged chunk PUTs", () => {
    const buf = new ArrayBuffer(10);
    const r = uploadChunkRequest("https://sess", "at", buf, 20, 100);
    expect(r.init.headers).toMatchObject({ "Content-Range": "bytes 20-29/100" });
  });
  it("parses completion and resume responses", () => {
    expect(parseUploadResponse(200, null, JSON.stringify({ id: "abc" }))).toEqual({ done: true, videoId: "abc" });
    expect(parseUploadResponse(308, "bytes=0-99", "")).toEqual({ done: false, uploadedBytes: 100 });
    expect(parseUploadResponse(308, null, "")).toEqual({ done: false, uploadedBytes: 0 });
    expect(() => parseUploadResponse(500, null, "boom")).toThrow(/HTTP 500/);
  });
  it("builds thumbnail and status requests", () => {
    expect(setThumbnailRequest("at", "v1").url).toContain("thumbnails/set?videoId=v1");
    expect(videoStatusRequest("at", "v1").url).toContain("videos?part=status");
  });
  it("parses video processing state", () => {
    expect(parseVideoState({ items: [{ status: { uploadStatus: "uploaded" }, processingDetails: { processingStatus: "processing" } }] })).toBe("processing");
    expect(parseVideoState({ items: [{ status: { uploadStatus: "failed" } }] })).toBe("failed");
    expect(parseVideoState({ items: [] })).toBe("missing");
  });
});

describe("videoOutcome", () => {
  const item = (uploadStatus: string, processingStatus?: string) => ({ items: [{ status: { uploadStatus }, ...(processingStatus ? { processingDetails: { processingStatus } } : {}) }] });
  it("posts only once YouTube finished processing", () => {
    expect(videoOutcome(item("processed", "succeeded")).outcome).toBe("posted");
    expect(videoOutcome(item("uploaded", "succeeded")).outcome).toBe("posted");
    expect(videoOutcome(item("processed")).outcome).toBe("posted");
  });
  it("keeps waiting while bytes are in but processing is not done", () => {
    expect(videoOutcome(item("uploaded", "processing")).outcome).toBe("waiting");
    expect(videoOutcome(item("uploaded")).outcome).toBe("waiting");
  });
  it("fails on rejected, deleted, terminated or a vanished video", () => {
    expect(videoOutcome(item("rejected")).outcome).toBe("failed");
    expect(videoOutcome(item("deleted")).outcome).toBe("failed");
    expect(videoOutcome(item("uploaded", "terminated")).outcome).toBe("failed");
    expect(videoOutcome(item("uploaded", "failed")).outcome).toBe("failed");
    expect(videoOutcome({ items: [] })).toEqual({ outcome: "failed", state: "missing" });
  });
});
