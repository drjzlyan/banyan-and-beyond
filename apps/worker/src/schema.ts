/** SQLite has no "ADD COLUMN IF NOT EXISTS", so these run one by one and a duplicate-column error means "already done". */
const ALTERS = [
  `ALTER TABLE episodes ADD COLUMN thumbnail_key TEXT`,
  // seconds of the rendered chapter MP4 (pitch shift makes it differ from the voiced length)
  `ALTER TABLE chapters ADD COLUMN video_duration REAL`,
];

/** Created lazily so there is no separate migration step in CI. Statements are idempotent. */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, theme_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'outline', outline_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS episodes_status ON episodes(status, created_at)`,
  `CREATE TABLE IF NOT EXISTS chapters (episode_id TEXT NOT NULL, idx INTEGER NOT NULL, title TEXT NOT NULL, spoken TEXT NOT NULL DEFAULT '', clips_json TEXT NOT NULL DEFAULT '[]', duration REAL NOT NULL DEFAULT 0, video_key TEXT, status TEXT NOT NULL DEFAULT 'chapter-pending', updated_at TEXT NOT NULL, PRIMARY KEY (episode_id, idx))`,
  `CREATE TABLE IF NOT EXISTS themes_used (theme_id TEXT PRIMARY KEY, used_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS yt_uploads (episode_id TEXT PRIMARY KEY, yt_video_id TEXT, resumable_url TEXT, status TEXT NOT NULL DEFAULT 'none', error TEXT, updated_at TEXT NOT NULL)`,
];

// per database, so tests with a fresh database get their tables too
const ready = new WeakSet<object>();
export async function ensureSchema(db: D1Database): Promise<void> {
  if (ready.has(db)) return;
  await db.batch(STATEMENTS.map((s) => db.prepare(s)));
  for (const s of ALTERS) {
    try {
      await db.prepare(s).run();
    } catch (e) {
      if (!/duplicate column/i.test((e as Error).message)) throw e;
    }
  }
  ready.add(db);
}
