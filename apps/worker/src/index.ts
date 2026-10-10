import { youtubeDescription, youtubeTitle } from "@banyan/core";
import type { Env } from "./env.ts";
import { ensureSchema } from "./schema.ts";
import { EpisodeWorkflow, RechapterWorkflow } from "./episode-workflow.ts";
import { createOutline, voiceNext } from "./voice-chapter.ts";
import { finalizeUploads, mintAccessToken } from "./youtube.ts";

export { EpisodeWorkflow, RechapterWorkflow };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The /api routes stay off (404) until ADMIN_TOKEN is set. Compared in constant time. */
function authorized(req: Request, env: Env): boolean {
  const want = env.ADMIN_TOKEN;
  const got = req.headers.get("x-admin-token") ?? "";
  if (!want || want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  await ensureSchema(env.DB);
  const now = () => new Date().toISOString();

  if (url.pathname === "/api/me") return json({ ok: true });

  if (url.pathname === "/api/episodes" && req.method === "GET") {
    const q = await env.DB.prepare("SELECT id, title, theme_id, kind, status, created_at FROM episodes ORDER BY created_at DESC LIMIT 50").all();
    return json(q.results);
  }

  const m = url.pathname.match(/^\/api\/episodes\/([\w-]+)(?:\/(chapters|status|upload-url|complete|thumbnail))?$/);
  if (m) {
    const [, id, sub] = m;
    const row = await env.DB.prepare("SELECT * FROM episodes WHERE id = ?").bind(id).first<{ outline_json: string; status: string; title: string }>();
    if (!row) return json({ error: "not found" }, 404);

    if (!sub && req.method === "GET") {
      const chapters = (await env.DB.prepare("SELECT idx, title, status, duration, video_key, updated_at FROM chapters WHERE episode_id = ? ORDER BY idx").bind(id).all()).results;
      return json({ ...row, outline: JSON.parse(row.outline_json), chapters });
    }
    if (sub === "chapters" && req.method === "GET") {
      const chapters = (await env.DB.prepare("SELECT * FROM chapters WHERE episode_id = ? ORDER BY idx").bind(id).all()).results;
      return json(chapters);
    }
    if (sub === "status" && req.method === "POST") {
      const { status } = (await req.json().catch(() => ({}))) as { status?: string };
      const ok = ["pending", "rendered", "approved", "uploading", "posted"];
      if (!ok.includes(status ?? "")) return json({ error: "bad status" }, 400);
      await env.DB.prepare("UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?").bind(status, now(), id).run();
      return json({ ok: true });
    }
    // Mint a short-lived upload token for the Studio browser: bytes flow
    // browser -> YouTube directly, the Worker never proxies video.
    if (sub === "upload-url" && req.method === "POST") {
      let access: string;
      try {
        access = await mintAccessToken(env);
      } catch (e) {
        return json({ error: (e as Error).message }, 409);
      }
      const chapters = (await env.DB.prepare("SELECT idx, duration FROM chapters WHERE episode_id = ? AND video_key IS NOT NULL ORDER BY idx").bind(id).all<{ idx: number; duration: number }>()).results;
      if (chapters.length !== 8) return json({ error: `episode needs 8 rendered chapters, has ${chapters.length}` }, 409);
      const outline = JSON.parse(row.outline_json) as { theme: { moral: string } };
      const description = youtubeDescription(youtubeTitle(row.title), chapters.map((c, i) => ({ title: `Chapter ${i + 1}`, start: 0 })), outline.theme.moral);
      const urls = (await env.DB.prepare("SELECT video_key FROM chapters WHERE episode_id = ? ORDER BY idx").bind(id).all<{ video_key: string }>()).results;
      const thumb = await env.DB.prepare("SELECT thumbnail_key FROM episodes WHERE id = ?").bind(id).first<{ thumbnail_key: string | null }>();
      await env.DB.prepare("INSERT OR REPLACE INTO yt_uploads (episode_id, status, updated_at) VALUES (?, 'session', ?)").bind(id, now()).run();
      return json({
        accessToken: access,
        title: youtubeTitle(row.title),
        description,
        parts: urls.map((u) => `${env.PUBLIC_BASE}/assets/${u.video_key}`),
        thumbnailUrl: thumb?.thumbnail_key ? `${env.PUBLIC_BASE}/assets/${thumb.thumbnail_key}` : null,
      });
    }
    if (sub === "complete" && req.method === "POST") {
      const { ytVideoId } = (await req.json().catch(() => ({}))) as { ytVideoId?: string };
      if (!ytVideoId) return json({ error: "ytVideoId required" }, 400);
      await env.DB.prepare("INSERT OR REPLACE INTO yt_uploads (episode_id, yt_video_id, status, updated_at) VALUES (?, ?, 'uploading', ?)").bind(id, ytVideoId, now()).run();
      await env.DB.prepare("UPDATE episodes SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now(), id).run();
      return json({ ok: true });
    }
    // the episode thumbnail (JPEG still, drawn in the browser like the video)
    if (sub === "thumbnail" && req.method === "PUT") {
      if (!req.body) return json({ error: "empty body" }, 400);
      if (Number(req.headers.get("content-length") ?? 0) > 8_000_000) return json({ error: "thumbnail must be under 8 MB" }, 413);
      const key = `episodes/${id}/thumb.jpg`;
      await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: "image/jpeg" } });
      await env.DB.prepare("UPDATE episodes SET thumbnail_key = ?, updated_at = ? WHERE id = ?").bind(key, now(), id).run();
      return json({ key, url: `${env.PUBLIC_BASE}/assets/${key}` });
    }
  }

  // re-script + re-voice one chapter (runs on the nightly cron; the old render is dropped when it lands)
  const r = url.pathname.match(/^\/api\/episodes\/([\w-]+)\/chapters\/(\d+)\/regenerate$/);
  if (r && req.method === "POST") {
    const [, id, idx] = r;
    const row = await env.DB.prepare("SELECT status FROM chapters WHERE episode_id = ? AND idx = ?").bind(id, Number(idx)).first<{ status: string }>();
    if (!row) return json({ error: "not found" }, 404);
    await env.RECHAPTER_WORKFLOW.create({ id: newId(), params: { episodeId: id, chapter: Number(idx) } });
    return json({ ok: true });
  }

  // the browser renders each chapter MP4 (free plan has no server-side renderer) and uploads it here
  const v = url.pathname.match(/^\/api\/episodes\/([\w-]+)\/chapters\/(\d+)\/video$/);
  if (v && req.method === "PUT") {
    const [, id, idx] = v;
    if (!req.body) return json({ error: "empty body" }, 400);
    const key = `episodes/${id}/ch-${idx}.mp4`;
    await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: "video/mp4" } });
    await env.DB.prepare("UPDATE chapters SET video_key = ?, status = 'rendered', updated_at = ? WHERE episode_id = ? AND idx = ?").bind(key, now(), id, Number(idx)).run();
    return json({ key, url: `${env.PUBLIC_BASE}/assets/${key}` });
  }

  if (url.pathname === "/api/run" && req.method === "POST") {
    const params = (await req.json().catch(() => ({}))) as { theme?: string };
    const id = await createOutline(env, params);
    return json({ id });
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return json({ ok: true });

    // Public, CORS-enabled media so the browser renderer and YouTube can fetch chapter videos.
    if (url.pathname.startsWith("/assets/")) {
      const key = decodeURIComponent(url.pathname.slice("/assets/".length));
      const base = { "access-control-allow-origin": "*", "cache-control": "public, max-age=86400", "accept-ranges": "bytes" };
      if (req.method === "HEAD") {
        const head = await env.BUCKET.head(key);
        if (!head) return new Response(null, { status: 404 });
        return new Response(null, { headers: { ...base, "content-type": head.httpMetadata?.contentType ?? "application/octet-stream", "content-length": String(head.size) } });
      }
      const obj = await env.BUCKET.get(key, { range: req.headers });
      if (!obj) return new Response("not found", { status: 404 });
      const type = obj.httpMetadata?.contentType ?? "application/octet-stream";
      return new Response(obj.body, { headers: { ...base, "content-type": type, "content-length": String(obj.size) } });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!authorized(req, env)) return new Response("not found", { status: 404 });
      return api(req, env, url);
    }
    return Response.redirect(`${url.origin}/studio/`, 302);
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // Nightly: advance the queue one step (outline if idle, else script + voice
    // the oldest pending chapter within the TTS char budget). Full episode ≈ 10-14 nights.
    if (event.cron === "0 22 * * *") {
      await voiceNext(env).then((r) => console.log("voiceNext", r)).catch((e) => console.log("voiceNext", (e as Error).message));
      return;
    }
    // 10-min: finalize YouTube uploads (status checks only, no bytes through the Worker).
    await finalizeUploads(env).then((r) => console.log("finalizeUploads", r)).catch((e) => console.log("finalizeUploads", (e as Error).message));
  },
} satisfies ExportedHandler<Env>;
