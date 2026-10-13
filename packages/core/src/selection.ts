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

/**
 * One through-line for the whole episode: a child's small wish or problem set up in chapter 1,
 * pushed further every chapter, a gentle low point in chapter 6 and a happy, surprising fix in
 * chapter 7, so viewers keep watching to find out how it ends. The chapters play back to back in
 * one video, so each beat also hands the next one a reason to keep listening.
 */
export function outlineBeats(theme: Theme): string[] {
  const v = theme.valueWord.toLowerCase();
  return [
    `Meet the main child of this story and ONE small wish or problem the whole story is about (a lost kite, a promise to keep, a broken pot). It quietly touches on ${v}.`,
    `Chasing that wish, the main child makes a small mistake that shows what happens without ${v}. The wish looks harder now.`,
    `A neighbour with a gentle dilemma about ${v} crosses the main child's path and gives a clue about the wish.`,
    `Ajja tells a short old tale inside the story, about animals or a king, that gives the main child an idea about ${v}.`,
    `The main child tries a small brave act of ${v}. It goes wrong twice before it starts to work.`,
    `The lowest moment: the wish seems lost and someone is sad. The main child must choose ${v} even though it is hard.`,
    `The main child chooses ${v} and makes amends; the village helps and the wish comes true in a surprising way.`,
    `Everyone celebrates together and Ajja gently closes the story. The moral: ${theme.moral}`,
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
