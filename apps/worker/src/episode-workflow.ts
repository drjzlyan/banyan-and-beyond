import { buildOutline, selectTheme } from "@banyan/core";
import { themeById } from "@banyan/core";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, EpisodeParams } from "./env.ts";
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

/** Re-voice a single chapter (same dialogue engine as the outline; facts = outline beat). */
export class RechapterWorkflow extends WorkflowEntrypoint<Env, { episodeId: string; chapter: number }> {
  async run(event: WorkflowEvent<{ episodeId: string; chapter: number }>, step: WorkflowStep) {
    const env = this.env;
    const { episodeId, chapter } = event.payload;
    await step.do("reset chapter", retry(2, "5 seconds"), async () => {
      await ensureSchema(env.DB);
      await env.DB.prepare("UPDATE chapters SET status = 'chapter-pending', video_key = NULL, updated_at = ? WHERE episode_id = ? AND idx = ?").bind(new Date().toISOString(), episodeId, chapter).run();
      await env.DB.prepare("UPDATE episodes SET status = 'chapter-pending', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), episodeId).run();
    });
    return { episodeId, chapter };
  }
}
