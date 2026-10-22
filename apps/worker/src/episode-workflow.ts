import type { EpisodeOutline } from "@banyan/core";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { deletePrefix } from "./clips.ts";
import type { Env, EpisodeParams, RechapterParams } from "./env.ts";
import { ensureSchema } from "./schema.ts";
import { createOutline } from "./voice-chapter.ts";

const retry = (limit: number, delay: `${number} seconds`) => ({ retries: { limit, delay, backoff: "exponential" as const }, timeout: "2 minutes" as const });

/**
 * One instance = one new story outline (one chapter row). It is planned, written and voiced over
 * the next nights by the cron (neuron budget: ~10k/day free).
 * Each step is its own invocation with its own CPU/subrequest budget (Workers Free).
 */
export class EpisodeWorkflow extends WorkflowEntrypoint<Env, EpisodeParams> {
  async run(event: WorkflowEvent<EpisodeParams>, step: WorkflowStep) {
    const env = this.env;

    // the same path as the cron and /api/run (premise pick, single-story outline)
    const created = await step.do("create outline", retry(2, "5 seconds"), async () => ({ id: await createOutline(env, { theme: event.payload?.theme }) }));
    return { id: created.id };
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
      // a new script is a new telling: drop the plan so the story is re-planned, not just re-worded
      if (!keepScript) {
        const ep = await env.DB.prepare("SELECT outline_json FROM episodes WHERE id = ?").bind(episodeId).first<{ outline_json: string }>();
        const outline = ep ? (JSON.parse(ep.outline_json) as EpisodeOutline) : null;
        if (outline?.plan) {
          delete outline.plan;
          await env.DB.prepare("UPDATE episodes SET outline_json = ? WHERE id = ?").bind(JSON.stringify(outline), episodeId).run();
        }
      }
    });
    return { episodeId, chapter, keepScript: !!keepScript };
  }
}
