/** YouTube publish helpers: description with chapter timestamps, title rules. */

export function youtubeDescription(title: string, chapters: { title: string; start: number }[], moral: string): string {
  const stamps = chapters
    .map((c) => `${formatTimestamp(c.start)} ${c.title}`)
    .join("\n");
  return `${title}\n\nA gentle Banyan and Beyond story for children.\n\nChapters:\n${stamps}\n\nMoral: ${moral}\n\nMade for kids aged 6 to 12. A grown-up story, told with love.`;
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function youtubeTitle(episodeTitle: string): string {
  const t = `Banyan and Beyond | ${episodeTitle} | Kids Moral Story`;
  return t.length > 100 ? t.slice(0, 97) + "..." : t;
}
