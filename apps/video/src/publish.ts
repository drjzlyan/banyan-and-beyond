import { parseUploadResponse, resumableInitRequest, setThumbnailRequest, uploadChunkRequest } from "@banyan/core";

const CHUNK = 8 * 1024 * 1024;

/**
 * Browser-side YouTube publish: a standalone story is one MP4, uploaded as is. A legacy episode's
 * chapter MP4s are fetched from R2 and joined with ffmpeg.wasm (same encoder settings, stream-copy).
 * Runs on the owner's laptop — the Worker never touches video bytes.
 */
export async function assembleEpisode(
  parts: string[],
  onProgress: (stage: string, fraction: number) => void,
): Promise<Blob> {
  if (parts.length === 1) {
    onProgress("fetching video", 0);
    const blob = await (await fetch(parts[0]!)).blob();
    onProgress("fetching video", 1);
    return new Blob([blob], { type: "video/mp4" });
  }
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
  const ffmpeg = new FFmpeg();
  onProgress("loading ffmpeg", 0);
  await ffmpeg.load({ coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm") });
  const list: string[] = [];
  for (const [i, url] of parts.entries()) {
    onProgress(`fetching chapter ${i + 1}/${parts.length}`, i / parts.length / 2);
    const data = await fetchFile(url);
    const name = `ch${i}.mp4`;
    await ffmpeg.writeFile(name, data);
    list.push(`file '${name}'`);
  }
  await ffmpeg.writeFile("list.txt", new TextEncoder().encode(list.join("\n")));
  onProgress("concatenating", 0.5);
  await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
  const data = await ffmpeg.readFile("out.mp4");
  const bytes = data as Uint8Array;
  onProgress("concatenating", 1);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" });
}

export interface UploadSession {
  accessToken: string;
  title: string;
  description: string;
  parts: string[];
  thumbnailUrl: string | null;
}

export async function resumableUpload(
  session: UploadSession,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const total = file.size;
  const init = resumableInitRequest(session.accessToken, { title: session.title, description: session.description });
  const initRes = await fetch(init.url, init.init);
  if (!initRes.ok) throw new Error(`YouTube refused the upload session: HTTP ${initRes.status}`);
  const sessionUrl = initRes.headers.get("Location");
  if (!sessionUrl) throw new Error("YouTube gave no resumable session URL");

  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + CHUNK, total);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    const put = uploadChunkRequest(sessionUrl, session.accessToken, chunk.buffer as ArrayBuffer, offset, total);
    const res = await fetch(put.url, { ...put.init, body: chunk });
    const parsed = parseUploadResponse(res.status, res.headers.get("Range"), await res.text());
    if (parsed.done) {
      onProgress(1);
      return parsed.videoId;
    }
    offset = parsed.uploadedBytes || end;
    onProgress(offset / total);
  }
  throw new Error("upload loop ended without completing");
}

export async function uploadThumbnail(session: UploadSession, videoId: string): Promise<void> {
  if (!session.thumbnailUrl) return;
  const blob = await (await fetch(session.thumbnailUrl)).blob();
  const req = setThumbnailRequest(session.accessToken, videoId);
  const res = await fetch(req.url, { ...req.init, body: blob });
  if (!res.ok) throw new Error(`thumbnail upload failed: HTTP ${res.status}`);
}
