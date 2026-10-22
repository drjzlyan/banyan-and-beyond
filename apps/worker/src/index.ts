import { AURA2_VOICES, MAX_CHAPTER_VIDEO_BYTES, NIGHTLY_TTS_CHAR_BUDGET, chapterStamps, mergeVoiceSettings, checkStatusChange, contentRange, isChapterVoiced, youtubeDescription, youtubeTitle } from "@banyan/core";
import type { Env } from "./env.ts";
import { ensureSchema } from "./schema.ts";
import { EpisodeWorkflow, RechapterWorkflow } from "./episode-workflow.ts";
import { getVoiceSettings, saveVoiceSettings, tts } from "./clips.ts";
import { createOutline, voiceNext } from "./voice-chapter.ts";
import { finalizeUploads, mintAccessToken } from "./youtube.ts";

export { EpisodeWorkflow, RechapterWorkflow };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Revision suffix for re-rendered media, so browsers never replay a cached old copy. */
const rev = () => Date.now().toString(36);
/** Once YouTube has the episode, the Studio must not change it underneath. */
const locked = (status: string) => status === "uploading" || status === "posted";

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

  if (url.pathname === "/api/me") {
    // what the Studio's System panel shows: is each piece configured, and what will the crons do
    return json({
      ok: true,
      youtube: !!(env.YT_CLIENT_ID && env.YT_CLIENT_SECRET && env.YT_REFRESH_TOKEN),
      publicBase: env.PUBLIC_BASE,
      crons: { voice: "0 22 * * *", finalize: "*/10 * * * *" },
      nightlyCharBudget: NIGHTLY_TTS_CHAR_BUDGET,
    });
  }

  if (url.pathname === "/api/settings") {
    if (req.method === "GET") return json({ voices: await getVoiceSettings(env), catalog: AURA2_VOICES });
    if (req.method === "PUT") {
      const body = (await req.json().catch(() => ({}))) as { voices?: Record<string, unknown> };
      const { settings, errors } = mergeVoiceSettings(await getVoiceSettings(env), body.voices ?? {});
      if (errors.length) return json({ error: errors.join("; ") }, 400);
      await saveVoiceSettings(env, settings);
      return json({ voices: settings });
    }
  }

  // Voice Lab: speak one short sample in any Aura voice (not stored). ~300 chars ≈ 800 neurons, so keep samples short.
  if (url.pathname === "/api/voice-preview" && req.method === "POST") {
    const { voice, text } = (await req.json().catch(() => ({}))) as { voice?: string; text?: string };
    if (!voice || !(AURA2_VOICES as readonly string[]).includes(voice)) return json({ error: "unknown voice" }, 400);
    const sample = (text ?? "").trim();
    if (!sample || sample.length > 300) return json({ error: "sample text must be 1-300 characters" }, 400);
    try {
      return new Response(await tts(env, voice, sample), { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
    } catch (e) {
      const msg = (e as Error).message;
      return json({ error: /3036|neuron/i.test(msg) ? "today's free Workers AI neurons are used up; try after 00:00 UTC" : msg.slice(0, 200) }, 502);
    }
  }

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
      const yt = await env.DB.prepare("SELECT status, yt_video_id, error, updated_at FROM yt_uploads WHERE episode_id = ?").bind(id).first();
      return json({ ...row, outline: JSON.parse(row.outline_json), chapters, yt_upload: yt ?? null });
    }
    if (sub === "chapters" && req.method === "GET") {
      const chapters = (await env.DB.prepare("SELECT * FROM chapters WHERE episode_id = ? ORDER BY idx").bind(id).all()).results;
      return json(chapters);
    }
    if (sub === "status" && req.method === "POST") {
      const { status } = (await req.json().catch(() => ({}))) as { status?: string };
      const counts = await env.DB.prepare("SELECT COUNT(*) total, COUNT(video_key) rendered FROM chapters WHERE episode_id = ?").bind(id).first<{ total: number; rendered: number }>();
      const refused = checkStatusChange(row.status, status ?? "", { renderedChapters: counts?.rendered ?? 0, totalChapters: counts?.total ?? 0 });
      if (refused) return json({ error: refused }, 409);
      await env.DB.prepare("UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?").bind(status, now(), id).run();
      return json({ ok: true });
    }
    // Mint a short-lived upload token for the Studio browser: bytes flow
    // browser -> YouTube directly, the Worker never proxies video.
    if (sub === "upload-url" && req.method === "POST") {
      // the human approval gate: nothing reaches YouTube unless the episode was approved in the Studio
      if (row.status !== "approved") return json({ error: `approve the episode first (it is ${row.status})` }, 409);
      let access: string;
      try {
        access = await mintAccessToken(env);
      } catch (e) {
        return json({ error: (e as Error).message }, 409);
      }
      const chapters = (await env.DB.prepare("SELECT idx, title, duration, video_duration, video_key FROM chapters WHERE episode_id = ? AND video_key IS NOT NULL ORDER BY idx").bind(id).all<{ idx: number; title: string; duration: number; video_duration: number | null; video_key: string }>()).results;
      if (chapters.length !== 8) return json({ error: `episode needs 8 rendered chapters, has ${chapters.length}` }, 409);
      const outline = JSON.parse(row.outline_json) as { theme: { moral: string } };
      const description = youtubeDescription(youtubeTitle(row.title), chapterStamps(chapters), outline.theme.moral);
      const thumb = await env.DB.prepare("SELECT thumbnail_key FROM episodes WHERE id = ?").bind(id).first<{ thumbnail_key: string | null }>();
      await env.DB.prepare("INSERT OR REPLACE INTO yt_uploads (episode_id, status, updated_at) VALUES (?, 'session', ?)").bind(id, now()).run();
      return json({
        accessToken: access,
        title: youtubeTitle(row.title),
        description,
        parts: chapters.map((c) => `${env.PUBLIC_BASE}/assets/${c.video_key}`),
        thumbnailUrl: thumb?.thumbnail_key ? `${env.PUBLIC_BASE}/assets/${thumb.thumbnail_key}` : null,
      });
    }
    if (sub === "complete" && req.method === "POST") {
      const { ytVideoId } = (await req.json().catch(() => ({}))) as { ytVideoId?: string };
      if (!ytVideoId) return json({ error: "ytVideoId required" }, 400);
      if (row.status !== "approved") return json({ error: `episode is ${row.status}, not approved` }, 409);
      await env.DB.prepare("INSERT OR REPLACE INTO yt_uploads (episode_id, yt_video_id, status, updated_at) VALUES (?, ?, 'uploading', ?)").bind(id, ytVideoId, now()).run();
      await env.DB.prepare("UPDATE episodes SET status = 'uploading', updated_at = ? WHERE id = ?").bind(now(), id).run();
      return json({ ok: true });
    }
    // the episode thumbnail (JPEG still, drawn in the browser like the video)
    if (sub === "thumbnail" && req.method === "PUT") {
      if (!req.body) return json({ error: "empty body" }, 400);
      if (Number(req.headers.get("content-length") ?? 0) > 8_000_000) return json({ error: "thumbnail must be under 8 MB" }, 413);
      const key = `episodes/${id}/thumb-${rev()}.jpg`;
      await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: "image/jpeg" } });
      const old = (row as { thumbnail_key?: string | null }).thumbnail_key;
      if (old) await env.BUCKET.delete(old);
      await env.DB.prepare("UPDATE episodes SET thumbnail_key = ?, updated_at = ? WHERE id = ?").bind(key, now(), id).run();
      return json({ key, url: `${env.PUBLIC_BASE}/assets/${key}` });
    }
  }

  // re-script + re-voice (regenerate) or re-voice only (revoice) one chapter; the nightly cron does the work
  const r = url.pathname.match(/^\/api\/episodes\/([\w-]+)\/chapters\/(\d+)\/(regenerate|revoice)$/);
  if (r && req.method === "POST") {
    const [, id, idx, how] = r;
    const row = await env.DB.prepare("SELECT status FROM chapters WHERE episode_id = ? AND idx = ?").bind(id, Number(idx)).first<{ status: string }>();
    if (!row) return json({ error: "not found" }, 404);
    const ep = await env.DB.prepare("SELECT status FROM episodes WHERE id = ?").bind(id).first<{ status: string }>();
    if (ep && locked(ep.status)) return json({ error: `episode is ${ep.status}; it can no longer change` }, 409);
    await env.RECHAPTER_WORKFLOW.create({ id: newId(), params: { episodeId: id, chapter: Number(idx), keepScript: how === "revoice" } });
    return json({ ok: true });
  }

  // the browser renders each chapter MP4 (free plan has no server-side renderer) and uploads it here
  const v = url.pathname.match(/^\/api\/episodes\/([\w-]+)\/chapters\/(\d+)\/video$/);
  if (v && req.method === "PUT") {
    const [, id, idx] = v;
    if (!req.body) return json({ error: "empty body" }, 400);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_CHAPTER_VIDEO_BYTES) return json({ error: "chapter video is too large for the free plan (100 MB per request)" }, 413);
    const ch = await env.DB.prepare("SELECT c.status, c.video_key, e.status AS ep_status FROM chapters c JOIN episodes e ON e.id = c.episode_id WHERE c.episode_id = ? AND c.idx = ?").bind(id, Number(idx)).first<{ status: string; video_key: string | null; ep_status: string }>();
    if (!ch) return json({ error: "not found" }, 404);
    // a half-voiced chapter must not be frozen as final: the cron only resumes chapter-pending rows
    if (!isChapterVoiced(ch.status)) return json({ error: "chapter is still being voiced" }, 409);
    if (locked(ch.ep_status)) return json({ error: `episode is ${ch.ep_status}; it can no longer change` }, 409);
    const seconds = Number(req.headers.get("x-video-duration"));
    const key = `episodes/${id}/ch-${idx}-${rev()}.mp4`;
    await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: "video/mp4" } });
    if (ch.video_key && ch.video_key !== key) await env.BUCKET.delete(ch.video_key);
    await env.DB.batch([
      env.DB.prepare("UPDATE chapters SET video_key = ?, video_duration = ?, status = 'rendered', updated_at = ? WHERE episode_id = ? AND idx = ?").bind(key, Number.isFinite(seconds) && seconds > 0 ? seconds : null, now(), id, Number(idx)),
      // a re-render after approval needs a fresh look before it can publish
      env.DB.prepare("UPDATE episodes SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'approved'").bind(now(), id),
    ]);
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
    // browsers ask the root for an icon; the Studio build ships it under /studio/
    if (url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg") return Response.redirect(`${url.origin}/studio/favicon.svg`, 301);

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
      // a Range request gets only the slice: answer 206 with its real length, or players and seeking break
      const part = contentRange(obj.range as { offset?: number; length?: number; suffix?: number } | undefined, obj.size);
      if (part) return new Response(obj.body, { status: 206, headers: { ...base, "content-type": type, "content-length": String(part.length), "content-range": part.header } });
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
