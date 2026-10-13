import { buildOutline, selectTheme } from "@banyan/core";
import { themeById } from "@banyan/core";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { deletePrefix } from "./clips.ts";
import type { Env, EpisodeParams, RechapterParams } from "./env.ts";
import { ensureSchema } from "./schema.ts";

const retry = (limit: number, delay: `${number} seconds`) => ({ retries: { limit, delay, backoff: "exponential" as const }, timeout: "2 minutes" as const });

/**
 * One instance = one episode outline + chapter queue.
 * Chapters are voiced one per night by the cron (neuron budget: ~10k/day free).
 * Each step is its own invocation with its own CPU/subrequest budget (Workers Free).
 */
export class EpisodeWorkflow extends WorkflowEntrypoint<Env, EpisodeParams> {
  async run(event: WorkflowEvent<EpisodeParams>, step: WorkflowStep) {
    const id = event.instanceId;
    const env = this.env;

    await step.do("create outline", retry(2, "5 seconds"), async () => {
      await ensureSchema(env.DB);
      const recent = (await env.DB.prepare("SELECT theme_id FROM themes_used ORDER BY used_at DESC LIMIT 4").all<{ theme_id: string }>()).results.map((r) => r.theme_id);
      const kinds = (await env.DB.prepare("SELECT kind FROM episodes ORDER BY created_at DESC LIMIT 2").all<{ kind: string }>()).results.map((r) => r.kind as never);
      const forced = event.payload?.theme ? themeById(event.payload.theme) : undefined;
      const picked = forced ? { theme: forced, kind: (kinds[kinds.length - 1] ?? "folk-tale") as never } : selectTheme(recent, kinds as never[]);
      const outline = buildOutline(picked.theme, picked.kind as never);
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO episodes (id, title, theme_id, kind, status, outline_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'outline', ?, ?, ?)").bind(id, outline.title, picked.theme.id, picked.kind, JSON.stringify(outline), now, now),
        ...outline.chapters.map((c) =>
          env.DB.prepare("INSERT OR REPLACE INTO chapters (episode_id, idx, title, updated_at) VALUES (?, ?, ?, ?)").bind(id, c.index, c.title, now),
        ),
        env.DB.prepare("INSERT OR REPLACE INTO themes_used (theme_id, used_at) VALUES (?, ?)").bind(picked.theme.id, now),
      ]);
      return { title: outline.title, theme: picked.theme.id };
    });

    return { id };
  }
}

/** Re-make one chapter on the nightly cron: new script + voice, or (keepScript) the same script in the current voices. */
export class RechapterWorkflow extends WorkflowEntrypoint<Env, RechapterParams> {
  async run(event: WorkflowEvent<RechapterParams>, step: WorkflowStep) {
    const env = this.env;
    const { episodeId, chapter, keepScript } = event.payload;
    // delete before resetting, so a cron run in between can never lose freshly voiced clips
    await step.do("delete old media", retry(2, "5 seconds"), async () => {
      await ensureSchema(env.DB);
      const row = await env.DB.prepare("SELECT video_key FROM chapters WHERE episode_id = ? AND idx = ?").bind(episodeId, chapter).first<{ video_key: string | null }>();
      if (row?.video_key) await env.BUCKET.delete(row.video_key);
      return { deleted: await deletePrefix(env, `episodes/${episodeId}/ch-${chapter}-`) };
    });
    await step.do("reset chapter", retry(2, "5 seconds"), async () => {
      await ensureSchema(env.DB);
      const now = new Date().toISOString();
      // clear the script too, or voiceNext would re-read it, find every line voiced and finish instantly
      await env.DB.batch([
        keepScript
          ? env.DB.prepare("UPDATE chapters SET status = 'chapter-pending', clips_json = '[]', duration = 0, video_key = NULL, video_duration = NULL, updated_at = ? WHERE episode_id = ? AND idx = ?").bind(now, episodeId, chapter)
          : env.DB.prepare("UPDATE chapters SET status = 'chapter-pending', spoken = '', clips_json = '[]', duration = 0, video_key = NULL, video_duration = NULL, updated_at = ? WHERE episode_id = ? AND idx = ?").bind(now, episodeId, chapter),
        // also drops any approval: the episode must be re-rendered and re-approved
        env.DB.prepare("UPDATE episodes SET status = 'chapter-pending', updated_at = ? WHERE id = ?").bind(now, episodeId),
      ]);
    });
    return { episodeId, chapter, keepScript: !!keepScript };
  }
}
