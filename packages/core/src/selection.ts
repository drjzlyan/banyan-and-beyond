import { STORY_KINDS, THEMES } from "./themes.ts";
import type { EpisodeOutline, StoryKind, Theme } from "./types.ts";

export const CHAPTER_COUNT = 8;
/** A theme returns after this many episodes (2-week cadence -> ~60 days ≈ 2 episodes gap). */
export const THEME_COOLDOWN_EPISODES = 2;

/** Pick the next theme: least-recently-used, rotating story kind. Pure + unit-tested. */
export function selectTheme(recentThemeIds: string[], recentKinds: StoryKind[]): { theme: Theme; kind: StoryKind } {
  const cooled = THEMES.filter((t) => !recentThemeIds.slice(-THEME_COOLDOWN_EPISODES).includes(t.id));
  const pool = cooled.length ? cooled : THEMES;
  // rotate kinds so consecutive episodes feel different
  const lastKind = recentKinds[recentKinds.length - 1];
  const kind = STORY_KINDS.find((k) => k !== lastKind) ?? STORY_KINDS[0];
  // deterministic pick: first theme not in cooldown window keeps tests stable;
  // the Workflow shuffles by episode count offset (see episode-workflow.ts later).
  return { theme: pool[recentThemeIds.length % pool.length], kind };
}

/** Fixed intro/outro added by code — the LLM never writes these. */
export const INTRO_LINE = "Namaste little friends, come sit with me under the old banyan tree.";
export const OUTRO_LINE = "Tell someone you love one kind thing you learned today.";

export function buildEpisodeTitle(theme: Theme, kind: StoryKind): string {
  const kindWord = kind === "folk-tale" ? "Tale" : kind === "village-story" ? "Story" : "Parable";
  return `The Banyan ${kindWord} of ${theme.valueWord}`;
}

export function outlineBeats(theme: Theme): string[] {
  return [
    `Ajja welcomes the children and wonders aloud about ${theme.valueWord.toLowerCase()}.`,
    `A small event in the village shows what happens without ${theme.valueWord.toLowerCase()}.`,
    `The children meet a neighbour facing a gentle dilemma about ${theme.valueWord.toLowerCase()}.`,
    `Ajja tells an old tale that shines light on ${theme.valueWord.toLowerCase()}.`,
    `The children try a small brave act of ${theme.valueWord.toLowerCase()} themselves.`,
    `Something goes a little wrong and everyone must make amends.`,
    `The village gathers and celebrates the lesson of ${theme.valueWord.toLowerCase()}.`,
    `Ajja closes with the moral: ${theme.moral}`,
  ];
}

export function buildOutline(theme: Theme, kind: StoryKind): EpisodeOutline {
  const beats = outlineBeats(theme);
  return {
    theme,
    kind,
    title: buildEpisodeTitle(theme, kind),
    chapters: beats.map((beat, index) => ({ index, title: `Chapter ${index + 1}`, beat })),
  };
}
