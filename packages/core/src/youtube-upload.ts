/** Pure YouTube Data API v3 request builders (no fetch — testable, used by Worker and Studio). */

export interface VideoMetadata {
  title: string;
  description: string;
  /** YouTube kids rules: our stories are made for kids. */
  madeForKids?: boolean;
  privacy?: "private" | "unlisted" | "public";
}

export function tokenRefreshRequest(clientId: string, clientSecret: string, refreshToken: string) {
  return {
    url: "https://oauth2.googleapis.com/token",
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    } satisfies RequestInit,
  };
}

/** Start a resumable upload session. Returns the session URL from the Location header. */
export function resumableInitRequest(accessToken: string, meta: VideoMetadata) {
  return {
    url: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: { title: meta.title, description: meta.description, categoryId: "27" },
        status: {
          privacyStatus: meta.privacy ?? "unlisted",
          selfDeclaredMadeForKids: meta.madeForKids ?? true,
        },
      }),
    } satisfies RequestInit,
  };
}

export function uploadChunkRequest(sessionUrl: string, accessToken: string, chunk: ArrayBuffer, offset: number, total: number) {
  return {
    url: sessionUrl,
    init: {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "video/mp4",
        "Content-Range": `bytes ${offset}-${offset + chunk.byteLength - 1}/${total}`,
      },
      body: chunk,
    } satisfies RequestInit,
  };
}

export type UploadResult =
  | { done: true; videoId: string }
  | { done: false; uploadedBytes: number };

/** Interpret a resumable-upload PUT response: 200/201 = complete, 308 = resume at Range. */
export function parseUploadResponse(status: number, rangeHeader: string | null, bodyText: string): UploadResult {
  if (status === 200 || status === 201) {
    try {
      const id = (JSON.parse(bodyText) as { id?: string }).id;
      if (id) return { done: true, videoId: id };
    } catch { /* fall through */ }
    throw new Error(`upload completed but no video id in response: ${bodyText.slice(0, 200)}`);
  }
  if (status === 308) {
    const m = rangeHeader?.match(/bytes=0-(\d+)/);
    return { done: false, uploadedBytes: m ? Number(m[1]) + 1 : 0 };
  }
  throw new Error(`upload PUT failed: HTTP ${status} ${bodyText.slice(0, 200)}`);
}

export function setThumbnailRequest(accessToken: string, videoId: string) {
  return {
    url: `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "image/jpeg" },
    } satisfies RequestInit,
  };
}

export function videoStatusRequest(accessToken: string, videoId: string) {
  return {
    url: `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(videoId)}`,
    init: { headers: { Authorization: `Bearer ${accessToken}` } } satisfies RequestInit,
  };
}

/** "uploaded" | "processed" | "failed" | unknown-state string from a videos.list response. */
export function parseVideoState(body: unknown): string {
  const item = (body as { items?: { status?: { uploadStatus?: string }; processingDetails?: { processingStatus?: string } }[] })?.items?.[0];
  if (!item) return "missing";
  if (item.status?.uploadStatus === "failed") return "failed";
  return item.processingDetails?.processingStatus ?? item.status?.uploadStatus ?? "unknown";
}
