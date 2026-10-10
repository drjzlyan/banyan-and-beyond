const KEY = "banyan.adminToken";

export const getToken = () => {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
};
export const setToken = (t: string) => {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...init.headers, "x-admin-token": getToken() } });
  if (res.status === 404 && path === "/api/me") throw new ApiError(404, "Wrong token, or ADMIN_TOKEN is not set on the Worker yet.");
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** PUT a file with upload progress (fetch cannot report it). */
export function putFile<T>(path: string, body: Blob, contentType: string, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", path);
    x.setRequestHeader("x-admin-token", getToken());
    x.setRequestHeader("content-type", contentType);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return resolve(JSON.parse(x.responseText) as T);
      let msg = `HTTP ${x.status}`;
      try { msg = (JSON.parse(x.responseText) as { error?: string }).error ?? msg; } catch { /* not JSON */ }
      reject(new ApiError(x.status, msg));
    };
    x.onerror = () => reject(new Error("Network error while uploading"));
    x.send(body);
  });
}

export interface EpisodeRow {
  id: string; title: string; theme_id: string; kind: string; status: string; created_at: string;
}

export interface ChapterRow {
  episode_id: string; idx: number; title: string; spoken: string; clips_json: string;
  duration: number; video_key: string | null; status: string; updated_at: string;
}

export interface EpisodeDetail {
  id: string; title: string; status: string;
  outline: { theme: { id: string; valueWord: string; moral: string }; kind: string; title: string };
  chapters: ChapterRow[];
  thumbnail_key?: string | null;
  yt_upload?: { status: string; yt_video_id: string | null; error: string | null } | null;
}
