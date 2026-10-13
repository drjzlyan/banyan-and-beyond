/**
 * Shot planning for the chapter video: a small "director" that turns the voiced lines and sound
 * cues into camera shots, so the scene cuts and moves like an animated show instead of sitting on
 * one wide frame. Pure and deterministic: the same chapter always gets the same shots.
 */
export type ShotKind = "establish" | "wide" | "two" | "ajja" | "kid";
export type Shot = { at: number; kind: ShotKind; /** hard cut instead of an eased camera move */ cut: boolean };

/** Opening wide shot under the title card. */
export const ESTABLISH_SECONDS = 4;
/** Never change shot sooner than this (stops flip-flopping on quick back-and-forth lines). */
export const MIN_SHOT_SECONDS = 3.5;
/** A sound cue may interrupt a shot sooner, so its picture is on screen. */
export const MIN_SHOT_BEFORE_CUE = 2;
/**
 * Lines at least this long get a close-up on the speaker; shorter ones stay on the two-shot. The
 * Kid's lines are short questions played 1.25× faster, so her bar is lower or she'd almost never
 * get a close-up (simulated on generator-shaped chapters: 3-5 % of screen time vs ~15 %).
 */
export const CLOSE_UP_MIN_LINE = { AJJA: 2.5, KID: 1.6 } as const;
/** After this long on one shot, vary it on the next line. */
export const MAX_SAME_SHOT = 12;
/** The lesson card at the end sits on a wide shot. */
export const OUTRO_SECONDS = 8;
/** Start a shot this much before its line so the camera is settling as the voice begins. */
export const LEAD_SECONDS = 0.25;

type Line = { speaker: "AJJA" | "KID"; start: number; end: number };
type Cue = { at: number; seconds: number };

const close = (speaker: Line["speaker"]): ShotKind => (speaker === "AJJA" ? "ajja" : "kid");
const isClose = (k: ShotKind) => k === "ajja" || k === "kid";

export function planShots(lines: Line[], cues: Cue[], duration: number): Shot[] {
  const shots: Shot[] = [{ at: 0, kind: "establish", cut: false }];
  const outroAt = duration > 20 ? duration - OUTRO_SECONDS : Infinity;
  const push = (at: number, kind: ShotKind, minHold: number) => {
    const cur = shots[shots.length - 1]!;
    if (kind === cur.kind || at - cur.at < minHold || at >= outroAt) return; // also keeps shots in time order
    // shot / reverse-shot between the two close-ups is a cut; everything else is a camera move
    shots.push({ at, kind, cut: isClose(kind) && isClose(cur.kind) });
  };

  type Event = { at: number; line?: Line; cue?: Cue };
  const events: Event[] = [
    ...lines.map((line): Event => ({ at: Math.max(0, line.start - LEAD_SECONDS), line })),
    ...cues.map((cue): Event => ({ at: Math.max(0, cue.at - LEAD_SECONDS), cue })),
  ].sort((a, b) => a.at - b.at || (a.cue ? -1 : 1));

  for (const e of events) {
    if (e.at < ESTABLISH_SECONDS) continue;
    if (e.cue) {
      // too soon after the last change: go wide as soon as allowed, while the cue still plays
      const at = Math.max(e.at, shots[shots.length - 1]!.at + MIN_SHOT_BEFORE_CUE);
      if (at < e.cue.at + e.cue.seconds - 1) push(at, "wide", MIN_SHOT_BEFORE_CUE);
      continue;
    }
    const line = e.line!;
    // a cue playing over this line keeps the wide shot so its picture stays visible
    const cueOver = cues.some((c) => c.at < line.end && c.at + c.seconds > line.start);
    const cur = shots[shots.length - 1]!;
    let kind: ShotKind = cueOver ? "wide" : line.end - line.start >= CLOSE_UP_MIN_LINE[line.speaker] ? close(line.speaker) : "two";
    if (kind === cur.kind && e.at - cur.at > MAX_SAME_SHOT) kind = isClose(kind) ? "two" : close(line.speaker);
    // never sit on the listener's close-up while the other one talks: change shot sooner
    const onListener = isClose(cur.kind) && cur.kind !== close(line.speaker);
    push(e.at, kind, onListener ? MIN_SHOT_BEFORE_CUE : MIN_SHOT_SECONDS);
  }
  if (outroAt < Infinity && shots[shots.length - 1]!.kind !== "wide") shots.push({ at: outroAt, kind: "wide", cut: false });
  return shots;
}

/** The shot on screen at `time`, the one before it, and how long it has been held. */
export function shotAt(shots: Shot[], time: number): { shot: Shot; prev: Shot | null; held: number } {
  let i = 0;
  while (i + 1 < shots.length && shots[i + 1]!.at <= time) i++;
  return { shot: shots[i]!, prev: i > 0 ? shots[i - 1]! : null, held: time - shots[i]!.at };
}
