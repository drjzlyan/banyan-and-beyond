import {
  buildOutline,
  generateChapter,
  isNeuronsExhausted,
  layoutLines,
  selectTheme,
  splitDialogue,
  splitNightlyShare,
  themeById,
  type AiRunner,
  type EpisodeOutline,
} from "@banyan/core";
import { speakLine, type StoredLineClip } from "./clips.ts";
import type { Env } from "./env.ts";
import { ensureSchema } from "./schema.ts";

const newId = () => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The nightly engine (cron 22:00 UTC). One invocation advances the queue by one step:
 * if no episode is in flight, it creates an outline; otherwise it scripts (if needed)
 * and voices the oldest pending chapter within the nightly TTS char budget.
 * Neuron exhaustion (error 3036/3040) simply pauses — the next night resumes,
 * because voiced clips and the spoken script persist in D1/R2.
 */
export async function voiceNext(env: Env): Promise<string> {
  await ensureSchema(env.DB);
  const now = () => new Date().toISOString();
  const ai: AiRunner = (model, input) => env.AI.run(model as never, input as never);

  const pending = await env.DB.prepare(
    `SELECT c.episode_id AS episodeId, c.idx AS idx FROM chapters c JOIN episodes e ON e.id = c.episode_id WHERE c.status = 'chapter-pending' ORDER BY e.created_at, c.idx LIMIT 1`,
  ).first<{ episodeId: string; idx: number }>();

  if (!pending) {
    const open = await env.DB.prepare(
      `SELECT id FROM episodes WHERE status != 'posted' ORDER BY created_at DESC LIMIT 1`,
    ).first<{ id: string }>();
    if (open) return `idle: episode ${open.id} awaiting studio`;
    return createOutline(env, {});
  }

  const ch = await env.DB.prepare("SELECT * FROM chapters WHERE episode_id = ? AND idx = ?").bind(pending.episodeId, pending.idx).first<{
    spoken: string; clips_json: string;
  }>();
  if (!ch) throw new Error(`chapter row missing for ${pending.episodeId} #${pending.idx}`);

  let lines;
  try {
    lines = splitDialogue(ch.spoken);
  } catch {
    lines = null;
  }
  if (!lines) {
    // script the chapter (two LLM halves); neuron exhaustion pauses until tomorrow
    try {
      const ep = await env.DB.prepare("SELECT outline_json FROM episodes WHERE id = ?").bind(pending.episodeId).first<{ outline_json: string }>();
      if (!ep) throw new Error(`episode ${pending.episodeId} missing`);
      const outline = JSON.parse(ep.outline_json) as EpisodeOutline;
      const gen = await generateChapter(ai, outline, pending.idx);
      await env.DB.prepare("UPDATE chapters SET spoken = ?, clips_json = '[]', duration = 0, updated_at = ? WHERE episode_id = ? AND idx = ?")
        .bind(gen.spoken, now(), pending.episodeId, pending.idx).run();
      lines = gen.lines;
    } catch (e) {
      if (isNeuronsExhausted(e)) return `paused-neurons scripting ${pending.episodeId} #${pending.idx}`;
      throw e;
    }
  }

  const voiced = JSON.parse(ch.clips_json || "[]") as StoredLineClip[];
  const remaining = lines.slice(voiced.length).map((l) => ({ speaker: l.speaker, text: l.text }));
  const { tonight } = splitNightlyShare(remaining);
  const fresh: StoredLineClip[] = [];
  try {
    for (const [i, l] of tonight.entries()) {
      const n = voiced.length + i;
      fresh.push(await speakLine(env, `episodes/${pending.episodeId}/ch-${pending.idx}-line-${n}.mp3`, l.speaker, l.text));
    }
  } catch (e) {
    // save whatever got voiced, then pause (neurons) or fail loudly (real error)
    const partial = [...voiced, ...fresh];
    const timeline = layoutLines(partial.map((c) => ({ speaker: c.speaker, text: c.text, duration: c.duration })));
    await env.DB.prepare("UPDATE chapters SET clips_json = ?, duration = ?, updated_at = ? WHERE episode_id = ? AND idx = ?")
      .bind(JSON.stringify(timed(timeline.clips, partial)), timeline.duration, now(), pending.episodeId, pending.idx).run();
    if (isNeuronsExhausted(e)) return `paused-neurons voicing ${pending.episodeId} #${pending.idx} (${partial.length}/${lines.length})`;
    throw e;
  }

  const all = [...voiced, ...fresh];
  const timeline = layoutLines(all.map((c) => ({ speaker: c.speaker, text: c.text, duration: c.duration })));
  const done = all.length >= lines.length;
  await env.DB.prepare("UPDATE chapters SET clips_json = ?, duration = ?, status = ?, updated_at = ? WHERE episode_id = ? AND idx = ?")
    .bind(JSON.stringify(timed(timeline.clips, all)), timeline.duration, done ? "rendered" : "chapter-pending", now(), pending.episodeId, pending.idx).run();
  if (done) {
    const left = await env.DB.prepare("SELECT COUNT(*) n FROM chapters WHERE episode_id = ? AND status != 'rendered'").bind(pending.episodeId).first<{ n: number }>();
    await env.DB.prepare("UPDATE episodes SET status = ?, updated_at = ? WHERE id = ?")
      .bind((left?.n ?? 0) === 0 ? "pending" : "chapter-pending", now(), pending.episodeId).run();
  }
  return done
    ? `rendered ${pending.episodeId} #${pending.idx} (${all.length} lines)`
    : `voiced ${pending.episodeId} #${pending.idx} (${all.length}/${lines.length}, resumes tomorrow)`;
}

function timed(clips: { start: number; end: number; words: { text: string; start: number; end: number }[] }[], parts: StoredLineClip[]) {
  return clips.map((c, i) => ({ ...c, speaker: parts[i].speaker, text: parts[i].text, url: parts[i].url }));
}

/** Create a fresh episode outline + 8 pending chapters. Used by the cron when idle and by /api/run. */
export async function createOutline(env: Env, params: { theme?: string }): Promise<string> {
  await ensureSchema(env.DB);
  const id = newId();
  const recent = (await env.DB.prepare("SELECT theme_id FROM themes_used ORDER BY used_at DESC LIMIT 4").all<{ theme_id: string }>()).results.map((r) => r.theme_id);
  const kinds = (await env.DB.prepare("SELECT kind FROM episodes ORDER BY created_at DESC LIMIT 2").all<{ kind: string }>()).results.map((r) => r.kind as never);
  const forced = params.theme ? themeById(params.theme) : undefined;
  if (params.theme && !forced) throw new Error(`unknown theme ${params.theme}`);
  const picked = forced ? { theme: forced, kind: (kinds[kinds.length - 1] ?? "folk-tale") as never } : selectTheme(recent, kinds as never[]);
  const outline = buildOutline(picked.theme, picked.kind as never);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO episodes (id, title, theme_id, kind, status, outline_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'chapter-pending', ?, ?, ?)").bind(id, outline.title, picked.theme.id, picked.kind, JSON.stringify(outline), now, now),
    ...outline.chapters.map((c) => env.DB.prepare("INSERT OR REPLACE INTO chapters (episode_id, idx, title, updated_at) VALUES (?, ?, ?, ?)").bind(id, c.index, c.title, now)),
    env.DB.prepare("INSERT OR REPLACE INTO themes_used (theme_id, used_at) VALUES (?, ?)").bind(picked.theme.id, now),
  ]);
  return id;
}
