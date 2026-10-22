import type { Premise } from "./premises.ts";
import { STORY_KINDS, THEMES } from "./themes.ts";
import type { EpisodeOutline, StoryKind, Theme } from "./types.ts";

/** One standalone story per video (owner's choice, 2026-10-22; it was 8 chapters joined into ~48 min). */
export const CHAPTER_COUNT = 1;
/** A theme returns after this many stories. */
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
 * A standalone story: one video, one "chapter" row, seeded with a public-domain premise. The
 * scenes are planned on the scripting night (generate.ts planStory) and stored back in the outline.
 */
export function buildOutline(theme: Theme, kind: StoryKind, premise?: Premise): EpisodeOutline {
  return {
    theme,
    kind,
    format: "story",
    premiseId: premise?.id,
    title: premise?.title ?? buildEpisodeTitle(theme, kind),
    chapters: [{ index: 0, title: premise?.title ?? "The story", beat: premise?.plot ?? `A simple story about ${theme.valueWord.toLowerCase()}.` }],
  };
}
