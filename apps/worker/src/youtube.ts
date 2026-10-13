import { parseVideoState, tokenRefreshRequest, videoStatusRequest } from "@banyan/core";
import type { Env } from "./env.ts";
import { ensureSchema } from "./schema.ts";

/** Exchange the stored refresh token for a short-lived access token. Never logged, never stored. */
export async function mintAccessToken(env: Env): Promise<string> {
  if (!env.YT_CLIENT_ID || !env.YT_CLIENT_SECRET || !env.YT_REFRESH_TOKEN) {
    throw new Error("YouTube is not configured on the Worker yet");
  }
  const r = tokenRefreshRequest(env.YT_CLIENT_ID, env.YT_CLIENT_SECRET, env.YT_REFRESH_TOKEN);
  const res = await fetch(r.url, r.init);
  const body = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!res.ok || !body?.access_token) throw new Error(`YouTube token refresh failed: HTTP ${res.status} ${body?.error ?? ""}`);
  return body.access_token;
}

/**
 * 10-minute cron: poll episodes the Studio uploaded. When YouTube finishes
 * processing, the episode flips to posted; failures go back to approved with
 * the error recorded. No bytes flow through the Worker.
 */
export async function finalizeUploads(env: Env): Promise<string> {
  if (!env.YT_CLIENT_ID || !env.YT_REFRESH_TOKEN) return "youtube-unconfigured";
  await ensureSchema(env.DB);
  // look for work first: this runs every 10 minutes and usually has nothing to do
  const rows = (await env.DB.prepare("SELECT episode_id, yt_video_id FROM yt_uploads WHERE status = 'uploading' AND yt_video_id IS NOT NULL LIMIT 5").all<{ episode_id: string; yt_video_id: string }>()).results;
  if (!rows.length) return "nothing-uploading";
  let access: string;
  try {
    access = await mintAccessToken(env);
  } catch (e) {
    return `token-failed: ${(e as Error).message}`;
  }
  const out: string[] = [];
  for (const r of rows) {
    try {
      const req = videoStatusRequest(access, r.yt_video_id);
      const res = await fetch(req.url, req.init);
      const state = parseVideoState(await res.json().catch(() => null));
      const now = new Date().toISOString();
      if (state === "processed" || state === "uploaded") {
        await env.DB.batch([
          env.DB.prepare("UPDATE yt_uploads SET status = 'posted', error = NULL, updated_at = ? WHERE episode_id = ?").bind(now, r.episode_id),
          env.DB.prepare("UPDATE episodes SET status = 'posted', updated_at = ? WHERE id = ?").bind(now, r.episode_id),
        ]);
        const freed = await freeChapterVideos(env, r.episode_id);
        out.push(`${r.episode_id}: posted (freed ${freed} chapter videos)`);
      } else if (state === "failed" || state === "missing") {
        await env.DB.batch([
          env.DB.prepare("UPDATE yt_uploads SET status = 'failed', error = ?, updated_at = ? WHERE episode_id = ?").bind(`YouTube reported ${state}`, now, r.episode_id),
          env.DB.prepare("UPDATE episodes SET status = 'approved', updated_at = ? WHERE id = ?").bind(now, r.episode_id),
        ]);
        out.push(`${r.episode_id}: ${state}`);
      } else {
        out.push(`${r.episode_id}: ${state}`);
      }
    } catch (e) {
      out.push(`${r.episode_id}: poll error ${(e as Error).message.slice(0, 80)}`);
    }
  }
  return out.join("; ");
}

/**
 * YouTube now holds the full episode, so drop the chapter MP4s (the bulk of R2 use)
 * to stay inside the 10 GB free allowance. Voice clips and the thumbnail are kept.
 */
async function freeChapterVideos(env: Env, episodeId: string): Promise<number> {
  const rows = (await env.DB.prepare("SELECT idx, video_key FROM chapters WHERE episode_id = ? AND video_key IS NOT NULL").bind(episodeId).all<{ idx: number; video_key: string }>()).results;
  if (!rows.length) return 0;
  await env.BUCKET.delete(rows.map((r) => r.video_key));
  await env.DB.prepare("UPDATE chapters SET video_key = NULL, updated_at = ? WHERE episode_id = ?").bind(new Date().toISOString(), episodeId).run();
  return rows.length;
}
