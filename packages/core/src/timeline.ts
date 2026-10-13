/**
 * Chapter timeline shaping. The eight chapter videos are joined into one ~48-minute YouTube video,
 * so each chapter gets bookends that work in that setting: the brand jingle opens chapter 1, a short
 * sting of the same tune opens every other chapter, a little room after the last line lets the
 * cliffhanger land before the iris closes, and only the final chapter gets the lesson card + outro.
 * Also the pause after each line, which is the one speaking-pace lever fully under our control
 * (Aura-2 takes no SSML), shared by the renderer and the length estimate.
 */
export type ChapterRole = "first" | "middle" | "final";

/** Full brand jingle under the title card, then Ajja's welcome. */
export const INTRO_FIRST_SECONDS = 6.5;
/** Short sting of the jingle's first phrase with the chapter card. */
export const INTRO_STING_SECONDS = 3;
/** Room after the last line so the cliffhanger is heard before the iris closes. */
export const TAIL_SECONDS = 2;
/** Final chapter: lesson card + outro reprise of the jingle. */
export const OUTRO_FINAL_SECONDS = 9;

export function chapterRole(index: number, count: number): ChapterRole {
  return index === 0 ? "first" : index >= count - 1 ? "final" : "middle";
}

export function bookendSeconds(role: ChapterRole): { intro: number; outro: number } {
  return {
    intro: role === "first" ? INTRO_FIRST_SECONDS : INTRO_STING_SECONDS,
    outro: role === "final" ? OUTRO_FINAL_SECONDS : TAIL_SECONDS,
  };
}

type Timed = { start: number; end: number; words?: { text: string; start: number; end: number }[] };

/** Shift a chapter's dialogue and cues behind its intro and add its tail/outro. */
export function withBookends<C extends Timed, Q extends { at: number }>(
  clips: C[], cues: Q[], duration: number, role: ChapterRole,
): { clips: C[]; cues: Q[]; duration: number; intro: number; outro: number } {
  const { intro, outro } = bookendSeconds(role);
  const sh = (t: number) => t + intro;
  return {
    clips: clips.map((c) => ({ ...c, start: sh(c.start), end: sh(c.end), ...(c.words ? { words: c.words.map((w) => ({ ...w, start: sh(w.start), end: sh(w.end) })) } : {}) })),
    cues: cues.map((q) => ({ ...q, at: sh(q.at) })),
    duration: intro + duration + outro,
    intro,
    outro,
  };
}

type Spoken = { speaker: string; text: string };

/** Base gap between lines. */
export const LINE_GAP = 0.35;

/**
 * Seconds of silence after a line, storyteller-style:
 * - a question to the children watching ("What would YOU do? Hmm?") gets a real thinking pause
 * - a trailing "..." is a held breath before the reveal
 * - Ajja handing over with a question gets a beat before the Kid answers
 * - quick Kid/Ajja banter (short lines) keeps moving
 */
export function pauseAfter(line: Spoken, next?: Spoken | null): number {
  const text = line.text.trim();
  if (!next) return LINE_GAP;
  // the prompt writes the question to viewers with a capital "YOU" and a "Hmm?"
  if (line.speaker === "AJJA" && (/\bYOU\b/.test(text) || /\bhmm\b[?.!]*\s*$/i.test(text))) return 1.4;
  if (/(\.\.\.|…)\s*$/.test(text)) return 0.9;
  if (line.speaker === "AJJA" && /\?\s*$/.test(text)) return 0.6;
  const short = (s: Spoken) => s.text.trim().split(/\s+/).length <= 6;
  if (line.speaker !== next.speaker && short(line) && short(next)) return 0.22;
  return LINE_GAP;
}

/** Total pause time a script will get, for length estimates. */
export function totalPauses(lines: Spoken[]): number {
  return lines.reduce((n, l, i) => n + (i < lines.length - 1 ? pauseAfter(l, lines[i + 1]) : 0), 0);
}
