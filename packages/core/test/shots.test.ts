import { describe, expect, it } from "vitest";
import { ESTABLISH_SECONDS, MIN_SHOT_BEFORE_CUE, OUTRO_SECONDS, planShots, shotAt, type Shot } from "../src/shots.ts";

type L = { speaker: "AJJA" | "KID"; start: number; end: number };
/** back-to-back lines with a 0.3 s gap */
const lines = (spec: [L["speaker"], number][], from = 1): L[] => {
  let t = from;
  return spec.map(([speaker, len]) => { const l = { speaker, start: t, end: t + len }; t += len + 0.3; return l; });
};
const gaps = (shots: Shot[]) => shots.slice(1).map((s, i) => s.at - shots[i]!.at);

describe("planShots", () => {
  it("opens on the establishing shot and ends wide for the lesson", () => {
    const ls = lines([["AJJA", 5], ["KID", 4], ["AJJA", 6], ["KID", 5], ["AJJA", 6]]);
    const shots = planShots(ls, [], 40);
    expect(shots[0]).toEqual({ at: 0, kind: "establish", cut: false });
    expect(shots[1]!.at).toBeGreaterThanOrEqual(ESTABLISH_SECONDS);
    expect(shots.at(-1)).toMatchObject({ at: 40 - OUTRO_SECONDS, kind: "wide" });
  });

  it("gives long lines a close-up on the speaker and cuts between close-ups", () => {
    const ls = lines([["AJJA", 3], ["AJJA", 4], ["KID", 4], ["AJJA", 5]], 2);
    const shots = planShots(ls, [], 60);
    expect(shots.map((s) => s.kind)).toEqual(["establish", "ajja", "kid", "ajja", "wide"]);
    expect(shots[2]!.cut).toBe(true);
    expect(shots[1]!.cut).toBe(false); // establish -> close-up is a camera move
  });

  it("keeps quick exchanges on the two-shot and never holds a shot under the minimum", () => {
    const ls = lines(Array.from({ length: 30 }, (_, i) => [i % 2 ? "KID" : "AJJA", i % 3 ? 1.4 : 2.8] as [L["speaker"], number]));
    const shots = planShots(ls, [], 120);
    for (const g of gaps(shots.slice(0, -1))) expect(g).toBeGreaterThanOrEqual(MIN_SHOT_BEFORE_CUE);
    expect(shots.some((s) => s.kind === "two")).toBe(true);
  });

  it("cuts away from the listener's close-up when the other one speaks", () => {
    const ls = lines([["AJJA", 4], ["AJJA", 4], ["KID", 1.5], ["AJJA", 3], ["KID", 2]], 2);
    const shots = planShots(ls, [], 60);
    for (const l of ls.filter((l) => l.start > 9)) {
      const s = shotAt(shots, l.start + 2.2).shot.kind;
      expect(s === (l.speaker === "AJJA" ? "kid" : "ajja"), `${l.speaker} line at ${l.start} filmed on ${s}`).toBe(false);
    }
  });

  it("goes wide for a sound cue, even a little sooner than the usual minimum", () => {
    const ls = lines([["AJJA", 6], ["AJJA", 6], ["KID", 4]], 3);
    const cue = { at: ls[0]!.start + 2.6, seconds: 2.4 };
    const shots = planShots(ls, [cue], 60);
    const wide = shots.find((s) => s.kind === "wide" && s.at < 50)!;
    expect(wide).toBeDefined();
    expect(wide.at).toBeLessThanOrEqual(cue.at);
    const before = shots[shots.indexOf(wide) - 1]!;
    expect(wide.at - before.at).toBeGreaterThanOrEqual(MIN_SHOT_BEFORE_CUE);
  });

  it("still goes wide for a cue that lands right after a shot change, once the minimum hold is up", () => {
    const ls: L[] = [{ speaker: "AJJA", start: 3, end: 8 }, { speaker: "KID", start: 8.3, end: 9.8 }, { speaker: "AJJA", start: 11.3, end: 15.3 }];
    const cue = { at: 10.1, seconds: 3.5 }; // 1.8 s after the two-shot for the Kid's quick line
    const shots = planShots(ls, [cue], 60);
    const two = shots.find((s) => s.kind === "two")!;
    const wide = shots.find((s) => s.kind === "wide" && s.at > two.at)!;
    expect(wide.at).toBeCloseTo(two.at + MIN_SHOT_BEFORE_CUE);
    expect(wide.at).toBeLessThan(cue.at + cue.seconds - 1);
    expect(shots.map((s) => s.at)).toEqual([...shots.map((s) => s.at)].sort((a, b) => a - b));
  });

  it("varies a long monologue instead of sitting on one close-up", () => {
    const ls = lines(Array.from({ length: 10 }, () => ["AJJA", 4] as [L["speaker"], number]));
    const shots = planShots(ls, [], 80);
    expect(shots.filter((s) => s.kind === "two").length).toBeGreaterThan(0);
  });

  it("is deterministic and shotAt finds the current shot", () => {
    const ls = lines([["AJJA", 5], ["KID", 4], ["AJJA", 6]], 2);
    const a = planShots(ls, [], 40), b = planShots(ls, [], 40);
    expect(a).toEqual(b);
    expect(shotAt(a, 0).shot.kind).toBe("establish");
    const s = shotAt(a, a[1]!.at + 1);
    expect(s.shot).toBe(a[1]); expect(s.prev).toBe(a[0]); expect(s.held).toBeCloseTo(1);
  });
});
