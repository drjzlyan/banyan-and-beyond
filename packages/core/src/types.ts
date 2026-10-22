/** Shared types for Banyan and Beyond: standalone ~7-min story videos for kids (6-12). */
import type { CastKind, LocationId, Mood } from "./world.ts";

/** AJJA (narrator), KID (listener under the banyan) or a story character's id from the plan (e.g. "MEENA"). */
export type Speaker = "AJJA" | "KID" | (string & {});

export interface DialogueLine {
  speaker: Speaker;
  /** Plain English, TTS-safe, no stage directions. */
  text: string;
}

export type StoryKind = "folk-tale" | "village-story" | "parable";

export interface Theme {
  /** stable id, e.g. "honesty" */
  id: string;
  /** value word shown on the moral card, e.g. "Honesty" */
  valueWord: string;
  /** one-line moral for the episode, e.g. "Telling the truth keeps friendships strong." */
  moral: string;
  virtues: string[];
}

export interface ChapterPlan {
  index: number; // 0-7
  title: string;
  /** ~2 sentence summary for the chapter-script prompt */
  beat: string;
}

export interface EpisodeOutline {
  theme: Theme;
  kind: StoryKind;
  title: string;
  chapters: ChapterPlan[];
  /** "story": one standalone video planned scene by scene. Missing on legacy 8-chapter episodes. */
  format?: "story";
  /** the public-domain plot seed (premises.ts id) */
  premiseId?: string;
  /** written by the planner on the scripting night; drives scenes, cast voices and sounds */
  plan?: StoryPlan;
  /** scenes accepted so far (script rows), so the next night resumes instead of starting over */
  draft?: string[];
  /** nights in a row the writing failed for a reason other than neurons; at 3 the story is re-planned */
  failures?: number;
}

export interface CastMember {
  /** speaker tag in the script, upper case (MEENA) */
  id: string;
  /** the name said aloud (Meena) */
  name: string;
  kind: CastKind;
  /** one simple trait the story leans on (curious, clumsy, bossy...) */
  trait: string;
}

export interface PlanScene {
  location: LocationId;
  /** cast ids present in the scene */
  cast: string[];
  /** what happens, one sentence */
  beat: string;
  /** the small funny moment that keeps kids watching */
  funny: string;
  mood: Mood;
}

/** The story's plan, written before any lines so every scene moves the plot forward exactly once. */
export interface StoryPlan {
  title: string;
  /** the hero's wish or problem */
  want: string;
  cast: CastMember[];
  /** the catchphrase repeated two or three times */
  chorus: string;
  /** a small mystery set up early and answered late */
  mystery: { question: string; answer: string; setupScene: number; payoffScene: number };
  scenes: PlanScene[];
}

export interface ClipPart {
  text: string;
  duration: number;
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface TimedClip extends ClipPart {
  index: number;
  start: number;
  end: number;
  url: string;
  speaker: Speaker;
  words: WordTiming[];
  /** browser pitch stored with a story character's line (Ajja's and the Kid's come from the Voice Lab) */
  pitch?: number;
  voice?: string;
}

/** A voiced, timed clip ready for the Studio renderer (what the worker stores in clips_json). */
export type PreparedClip = TimedClip;

export interface ChapterProps {
  index: number;
  title: string;
  lines: DialogueLine[];
  clips: TimedClip[];
  duration: number;
}

export interface EpisodeProps {
  title: string;
  theme: Theme;
  kind: StoryKind;
  chapters: ChapterProps[];
}

export type EpisodeStatus =
  | "outline"
  | "chapter-pending"
  | "pending"
  | "rendered"
  | "approved"
  | "uploading"
  | "posted"
  | "archived";
