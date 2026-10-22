import { describe, expect, it } from "vitest";
import { JOINTS, legIk, simulateMotion, type Action, type Skeleton } from "../src/motion.ts";

/** The pilot girl's measured rest skeleton (apps/video/art/cast-rig.json). */
const SK: Skeleton = { hipL: [470, 716], kneeL: [469, 828], ankleL: [469, 895], hipR: [566, 716], kneeR: [566, 828], ankleR: [566, 895] };
const FPS = 24;
const SHOW: Action[] = [
  { at: 0, do: "walk", to: 0 },
  { at: 5, do: "talk" },
  { at: 5.5, do: "wave" },
  { at: 7, do: "jump", height: 90 },
  { at: 7, do: "cheer" },
  { at: 9, do: "sad" },
  { at: 11, do: "walk", to: 500 },
];
const run = () => simulateMotion(SK, SHOW, 16, FPS, { startX: -500 });

describe("legIk", () => {
  it("rests with a soft knee and bends the knee outward when the hips drop", () => {
    const r1: [number, number] = [-1, 112], r2: [number, number] = [0, 67];
    const rest = legIk([470, 716], [469, 895], r1, r2, -1);
    // soft IK keeps a little bend even at full reach, so the knee never locks and pops
    expect(Math.abs(rest.thigh)).toBeLessThan(12);
    expect(Math.abs(rest.shin)).toBeLessThan(24);
    const crouch = legIk([470, 716], [469, 855], r1, r2, -1);
    expect(crouch.knee[0]).toBeLessThan(465); // left knee goes left
    expect(legIk([566, 716], [566, 855], [0, 112], r2, 1).knee[0]).toBeGreaterThan(570);
  });
  it("never returns NaN, even out of reach or at the hip", () => {
    for (const target of [[470, 2000], [470, 716], [900, 716], [470, 717]] as [number, number][]) {
      const r = legIk([470, 716], target, [-1, 112], [0, 67], -1);
      expect(Number.isFinite(r.thigh) && Number.isFinite(r.shin)).toBe(true);
    }
  });
});

describe("simulateMotion", () => {
  const frames = run();
  it("is deterministic, so any frame can be rendered on its own", () => {
    const again = run();
    for (const i of [0, 37, 100, 199, frames.length - 1]) expect(again[i]).toEqual(frames[i]);
  });
  it("travels to the walk target and back out", () => {
    expect(frames[0]!.x).toBeLessThan(-450);
    expect(Math.abs(frames[Math.round(5 * FPS)]!.x)).toBeLessThan(25);
    expect(frames[frames.length - 1]!.x).toBeGreaterThan(300);
  });
  it("keeps a planted foot planted (no sliding)", () => {
    let worst = 0;
    for (let i = 1; i < frames.length; i++) for (const k of [0, 1] as const) {
      if (frames[i]!.planted[k] && frames[i - 1]!.planted[k]) worst = Math.max(worst, Math.abs(frames[i]!.feet[k][0] - frames[i - 1]!.feet[k][0]));
    }
    expect(worst).toBeLessThan(1);
  });
  it("takes short, child-sized steps without crossing the feet", () => {
    for (const f of frames) expect(f.feet[0][0]).toBeLessThan(f.feet[1][0] - 40);
    let longest = 0;
    for (let i = 1; i < frames.length; i++) for (const k of [0, 1] as const) if (!frames[i - 1]!.planted[k] && frames[i]!.planted[k]) {
      let j = i - 1; while (j > 0 && !frames[j - 1]!.planted[k]) j--;
      longest = Math.max(longest, Math.abs(frames[i]!.feet[k][0] - frames[j - 1]!.feet[k][0]));
    }
    expect(longest).toBeLessThan(110);
  });
  it("actually steps while walking (feet alternate)", () => {
    const walk = frames.slice(0, Math.round(3.5 * FPS));
    const lifted = [0, 1].map((k) => walk.filter((f) => !f.planted[k]).length);
    expect(lifted[0]).toBeGreaterThan(5);
    expect(lifted[1]).toBeGreaterThan(5);
  });
  it("jumps: crouches first, leaves the ground, lands without sinking through it", () => {
    const at = (s: number) => frames[Math.round(s * FPS)]!;
    expect(at(7.15).y).toBeGreaterThan(15); // anticipation crouch (y down)
    const air = frames.slice(Math.round(7.2 * FPS), Math.round(7.9 * FPS));
    expect(Math.min(...air.map((f) => f.y))).toBeLessThan(-60);
    const ground = 895;
    for (const f of frames) for (const p of f.feet) expect(p[1]).toBeLessThanOrEqual(ground + 0.5);
  });
  it("has no pops: joints speed up and slow down smoothly", () => {
    // a pop is a jump in a joint's speed between frames (second difference); a fast but smooth swing,
    // like a knee flexing 40° through a step, is allowed
    let fast = 0, pop = 0, where = "";
    for (const j of JOINTS) {
      const a = frames.map((f) => f.angles[j]);
      for (let i = 2; i < a.length; i++) {
        const v1 = a[i - 1]! - a[i - 2]!, v2 = a[i]! - a[i - 1]!;
        fast = Math.max(fast, Math.abs(v2));
        if (Math.abs(v2 - v1) > pop) { pop = Math.abs(v2 - v1); where = `${j}@${i}`; }
      }
    }
    expect(fast).toBeLessThan(25);
    expect(pop, where).toBeLessThan(20);
  });
  it("blinks at irregular intervals", () => {
    const starts = frames.flatMap((f, i) => (f.blink > 0 && !(frames[i - 1]?.blink) ? [i] : []));
    expect(starts.length).toBeGreaterThan(2);
    const gaps = starts.slice(1).map((s, i) => s - starts[i]!);
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });
});
