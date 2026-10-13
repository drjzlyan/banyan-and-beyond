export interface EpisodeParams {
  /** force a theme id (e.g. "honesty") instead of rotation */
  theme?: string;
}

/** keepScript: re-voice only (e.g. after picking new voices); otherwise re-script and re-voice */
export interface RechapterParams {
  episodeId: string;
  chapter: number;
  keepScript?: boolean;
}

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  AI: Ai;
  EPISODE_WORKFLOW: Workflow<EpisodeParams>;
  RECHAPTER_WORKFLOW: Workflow<RechapterParams>;
  CF_ACCOUNT_ID: string;
  PUBLIC_BASE: string;
  /** secrets, set from GitHub Actions on deploy */
  ADMIN_TOKEN?: string;
  YT_CLIENT_ID?: string;
  YT_CLIENT_SECRET?: string;
  YT_REFRESH_TOKEN?: string;
}
