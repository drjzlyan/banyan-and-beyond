/** Pure episode/chapter lifecycle rules shared by the Worker and the Studio (unit-tested). */

/**
 * Chapter states: scripted+voiced overnight, then rendered in the Studio.
 * Legacy rows used "rendered" for "voiced", so a "rendered" row without a video counts as voiced.
 */
export type ChapterStatus = "chapter-pending" | "voiced" | "rendered";

export const isChapterVoiced = (status: string) => status === "voiced" || status === "rendered";

/** Free plan caps a request body at 100 MB; stay clear of it for chapter MP4 PUTs. */
export const MAX_CHAPTER_VIDEO_BYTES = 95_000_000;

/**
 * Chapter video bitrate (bits/s). Flat SVG storybook scenes compress well; at ~1 Mbps a
 * 7-minute chapter is ~60 MB, under the 100 MB body cap, and 8 of them fit ffmpeg.wasm memory.
 */
export const CHAPTER_VIDEO_BITRATE = 1_000_000;

/** Episodes the nightly engine still works on or waits for (posted and archived ones are done). */
export const isOpenEpisode = (status: string) => status !== "posted" && status !== "archived";

/** Statuses the Studio may set by hand. uploading/posted only come from the publish flow and cron. */
export function checkStatusChange(
  from: string,
  to: string,
  ctx: { renderedChapters: number; totalChapters: number },
): string | null {
  if (from === "archived") return "an archived episode stays archived";
  if (to === "archived") {
    if (from === "uploading" || from === "posted") return `episode is already ${from}`;
    return null;
  }
  if (to === "approved") {
    if (from === "uploading" || from === "posted") return `episode is already ${from}`;
    if (from === "chapter-pending" || from === "outline") return "chapters are still being voiced";
    if (ctx.renderedChapters < ctx.totalChapters) return `render all chapters first (${ctx.renderedChapters}/${ctx.totalChapters} have video)`;
    return null;
  }
  if (to === "pending") {
    if (from !== "approved") return `only an approved episode can be un-approved (it is ${from})`;
    return null;
  }
  return `status ${to} cannot be set by hand`;
}

/** YouTube chapter timestamps from real rendered lengths (pitch shift changes the voiced length). */
export function chapterStamps(
  chapters: { title: string; video_duration?: number | null; duration?: number | null }[],
  fallbackSeconds = 450,
): { title: string; start: number }[] {
  let at = 0;
  return chapters.map((c) => {
    const s = { title: c.title, start: Math.round(at) };
    at += c.video_duration || c.duration || fallbackSeconds;
    return s;
  });
}

/**
 * Turn the range R2 actually served into a 206 Content-Range. Returns null when the
 * whole object was served (no range, or a range covering it all).
 */
export function contentRange(
  range: { offset?: number; length?: number; suffix?: number } | undefined,
  size: number,
): { start: number; end: number; length: number; header: string } | null {
  if (!range || size <= 0) return null;
  let start: number;
  let length: number;
  if (range.suffix !== undefined) {
    length = Math.min(range.suffix, size);
    start = size - length;
  } else {
    start = range.offset ?? 0;
    length = Math.min(range.length ?? size - start, size - start);
  }
  if (start === 0 && length === size) return null;
  const end = start + length - 1;
  return { start, end, length, header: `bytes ${start}-${end}/${size}` };
}

/** Short stable hash (FNV-1a) so a re-voiced line with new text gets a new, cache-safe key. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** R2 key from a public asset URL (`${PUBLIC_BASE}/assets/<key>`). */
export function assetKeyFromUrl(url: string): string | null {
  const i = url.indexOf("/assets/");
  return i < 0 ? null : decodeURIComponent(url.slice(i + "/assets/".length));
}
