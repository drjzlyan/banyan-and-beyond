/** Shared types for Banyan and Beyond: ~48-min story episodes in 8 chapters for kids (6-12). */

export type Speaker = "AJJA" | "KID";

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
  | "posted";
