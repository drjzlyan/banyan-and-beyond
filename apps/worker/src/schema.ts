/** Created lazily so there is no separate migration step in CI. Statements are idempotent. */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, theme_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'outline', outline_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS episodes_status ON episodes(status, created_at)`,
  `CREATE TABLE IF NOT EXISTS chapters (episode_id TEXT NOT NULL, idx INTEGER NOT NULL, title TEXT NOT NULL, spoken TEXT NOT NULL DEFAULT '', clips_json TEXT NOT NULL DEFAULT '[]', duration REAL NOT NULL DEFAULT 0, video_key TEXT, status TEXT NOT NULL DEFAULT 'chapter-pending', updated_at TEXT NOT NULL, PRIMARY KEY (episode_id, idx))`,
  `CREATE TABLE IF NOT EXISTS themes_used (theme_id TEXT PRIMARY KEY, used_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS yt_uploads (episode_id TEXT PRIMARY KEY, yt_video_id TEXT, resumable_url TEXT, status TEXT NOT NULL DEFAULT 'none', error TEXT, updated_at TEXT NOT NULL)`,
];

let ready = false;
export async function ensureSchema(db: D1Database): Promise<void> {
  if (ready) return;
  await db.batch(STATEMENTS.map((s) => db.prepare(s)));
  ready = true;
}
