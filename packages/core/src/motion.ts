/**
 * Character motion for story-world puppets: a small physics model instead of per-joint sine waves.
 * The owner found the first pilot "too puppetty" (2026-10-22): every joint swung on its own perfect
 * sine, in lockstep, with no weight, and the feet slid. This module simulates the whole performance
 * once, at a fixed small time step, into per-frame samples. Any frame then reads the same values,
 * which keeps Remotion's random-access rendering (Player scrubbing, the web renderer) deterministic.
 *
 * - Joints are damped springs toward the action's target pose. Stiffness falls off from the body
 *   to the hands and head, so outer parts follow through and overlap instead of moving as one.
 * - Legs are two-bone IK to feet that stay planted on the ground. A foot steps (lifts on an arc,
 *   lands ahead) only when it falls too far behind the hips, so a planted foot never slides.
 * - The body shifts its weight onto the standing foot, bobs with each step, leans into acceleration.
 * - Jumps crouch first, launch under gravity, squash on landing and settle with a bounce.
 * - Idle never stands still: irregular breathing and drift, and blinks at random seeded intervals.
 *
 * Units are the character art's own units (the girl is ~880 tall). Angles are CSS degrees
 * (positive is clockwise on screen), relative to the art's T-pose, child joints relative to parent.
 */

export type Vec = [number, number];

/** Rest positions from the rig (cast-rig.json), in art units. */
export interface Skeleton {
  hipL: Vec; kneeL: Vec; ankleL: Vec;
  hipR: Vec; kneeR: Vec; ankleR: Vec;
}

export type Mode = "idle" | "walk" | "talk" | "wave" | "point" | "cheer" | "sad" | "surprised" | "laugh";
export type Action =
  | { at: number; do: Mode; to?: number; speed?: number }
  | { at: number; do: "jump"; height?: number };

export const JOINTS = ["torso", "head", "armL", "foreL", "handL", "armR", "foreR", "handR", "thighL", "shinL", "thighR", "shinR"] as const;
export type Joint = (typeof JOINTS)[number];

export interface MotionFrame {
  /** root offset from the rest position, art units (y negative is up) */
  x: number; y: number;
  /** squash and stretch of the upper body (1 = none) */
  sx: number; sy: number;
  angles: Record<Joint, number>;
  /** 0 open .. 1 shut */
  blink: number;
  /** world positions of the ankles (for tests and debugging) */
  feet: [Vec, Vec];
  /** a foot is planted (not stepping, not airborne) */
  planted: [boolean, boolean];
}

/* ---------- helpers ---------- */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const deg = (r: number) => (r * 180) / Math.PI;
const ang = ([x, y]: Vec) => Math.atan2(y, x);
const len = ([x, y]: Vec) => Math.hypot(x, y);
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Smooth, irregular drift in -1..1: a few incommensurate sines with seeded phases. */
function drift(seed: number) {
  const r = rng(seed);
  const parts = [0.13, 0.29, 0.47, 0.71].map((f) => [f * (0.8 + r() * 0.4), r() * Math.PI * 2, 0.4 + r() * 0.6] as const);
  const total = parts.reduce((n, p) => n + p[2], 0);
  return (t: number) => parts.reduce((n, [f, ph, a]) => n + Math.sin(t * f * Math.PI * 2 + ph) * a, 0) / total;
}

/**
 * Two-bone IK: thigh from `hip` (rest direction r1, length L1) and shin (r2, L2) reaching `target`.
 * `out` is +1 to bend the knee toward +x, -1 toward -x. Returns local angles in degrees: the thigh
 * relative to its rest direction, the shin relative to the thigh. Never NaN: reach is clamped.
 */
export function legIk(hip: Vec, target: Vec, r1: Vec, r2: Vec, out: number): { thigh: number; shin: number; knee: Vec } {
  const L1 = len(r1), L2 = len(r2);
  const d0 = sub(target, hip);
  // soft IK: reach eases into full extension instead of snapping straight (near-straight knees are
  // where the knee angle is most sensitive, so a hard clamp makes the shin pop)
  const max = L1 + L2, soft = 0.965 * max, raw = len(d0) || 1e-6;
  const reach = raw <= soft ? raw : soft + (max - soft) * (1 - Math.exp(-(raw - soft) / (max - soft)));
  const d = clamp(reach, Math.abs(L1 - L2) + 1e-3, max - 1e-3);
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  // in screen coords (y down) a positive rotation is clockwise; bending the knee toward +x needs a negative turn from a downward reach
  const thighDir = ang(d0) - out * Math.acos(cosA);
  const knee: Vec = [hip[0] + Math.cos(thighDir) * L1, hip[1] + Math.sin(thighDir) * L1];
  const shinDir = ang(sub(target, knee));
  return { thigh: deg(wrap(thighDir - ang(r1))), shin: deg(wrap(shinDir - ang(r2) - (thighDir - ang(r1)))), knee };
}

/* ---------- target poses ---------- */

type Pose = Partial<Record<Joint, number>> & { crouch?: number };
const DOWN = 78; // arms at the sides (the art is a T-pose)

/** The upper-body pose an action asks for at time `t` since it began (legs come from IK). */
function modePose(mode: Mode, t: number, n: (k: string) => (t: number) => number): Pose {
  const s = (f: number, ph = 0) => Math.sin(t * f * Math.PI * 2 + ph);
  switch (mode) {
    case "wave": return { armL: -DOWN + 2, foreL: -10, handL: -12, armR: -55, foreR: -35 + s(1.8) * 26, handR: -10 + s(1.8, -0.9) * 14, head: 4 + n("hw")(t) * 3 };
    case "point": return { armL: -DOWN, foreL: -10, handL: -12, armR: -8, foreR: -4, handR: 4, head: 5, torso: 2 };
    case "cheer": return { armL: 40, foreL: 25, handL: 10, armR: -40, foreR: -25, handR: -10, head: n("ch")(t) * 6 };
    case "sad": return { armL: -86, foreL: 4, handL: -2, armR: 86, foreR: -4, handR: 2, head: 11, torso: -1.5, crouch: 10 };
    case "surprised": return { armL: -30, foreL: 70, handL: 25, armR: 30, foreR: -70, handR: -25, head: -5, crouch: -6 };
    case "laugh": return { armL: -58, foreL: -60, handL: -15, armR: 58, foreR: 60, handR: 15, head: s(3.1) * 5, torso: s(1.55) * 2.5, crouch: 4 + s(3.1) * 4 };
    case "talk": {
      // beat gestures: one forearm lifts on a seeded rhythm while the other stays relaxed
      const beat = Math.max(0, n("tk")(t * 2.2));
      return { armL: -DOWN + 4, foreL: -12 - beat * 25, handL: -14, armR: DOWN - 6 - beat * 10, foreR: 14 + n("tk2")(t * 1.7) * 18, handR: 12, head: n("th")(t * 1.6) * 4 };
    }
    case "walk": return { armL: -DOWN, foreL: -12, handL: -14, armR: DOWN, foreR: 12, handR: 14, head: 0 };
    case "idle":
    default: return { armL: -DOWN + n("ai")(t) * 2.5, foreL: -10, handL: -12, armR: DOWN + n("ar")(t) * 2.5, foreR: 10, handR: 12, head: n("hi")(t) * 3, torso: n("ti")(t) * 1 };
  }
}

/** Spring stiffness (1/s²) and damping ratio per joint: stiff near the body, loose at the ends. */
const SPRING: Record<Joint, [number, number]> = {
  torso: [140, 0.8], head: [70, 0.45],
  armL: [110, 0.7], foreL: [130, 0.55], handL: [160, 0.38],
  armR: [110, 0.7], foreR: [130, 0.55], handR: [160, 0.38],
  thighL: [0, 0], shinL: [0, 0], thighR: [0, 0], shinR: [0, 0],
};
/** Moods change the springs: sad is sluggish, cheerful is bouncy. */
const MOOD: Partial<Record<Mode, number>> = { sad: 0.5, cheer: 1.25, laugh: 1.2, surprised: 1.6 };

/* ---------- simulation ---------- */

export const MOTION_STEP = 1 / 240;
const GRAVITY = 4200; // art units/s² (cartoon-floaty: real gravity for a ~1.2 m child would be ~7000)
const STEP_LIFT = 18;
/** A small child's step: short and quick (seconds per step at the default walking speed). */
const STEP_SECONDS = 0.28;
export const WALK_SPEED = 120;
const SOFT_KNEES = 2.5;
/** Degrees per second; about 17° a frame at 24 fps. */
const MAX_JOINT_SPEED = 400;

/** Simulate a performance into `frames` samples at `fps`. Deterministic for the same inputs. */
export function simulateMotion(sk: Skeleton, actions: Action[], seconds: number, fps: number, opts: { seed?: number; startX?: number } = {}): MotionFrame[] {
  const seed = opts.seed ?? 1;
  const acts = [...actions].sort((a, b) => a.at - b.at);
  const noises = new Map<string, (t: number) => number>();
  let ni = 0;
  const n = (k: string) => { if (!noises.has(k)) noises.set(k, drift(seed * 7919 + ++ni * 104729)); return noises.get(k)!; };

  const r1L = sub(sk.kneeL, sk.hipL), r2L = sub(sk.ankleL, sk.kneeL);
  const r1R = sub(sk.kneeR, sk.hipR), r2R = sub(sk.ankleR, sk.kneeR);
  const groundY = (sk.ankleL[1] + sk.ankleR[1]) / 2;

  // state
  const angle = Object.fromEntries(JOINTS.map((j) => [j, 0])) as Record<Joint, number>;
  const vel = Object.fromEntries(JOINTS.map((j) => [j, 0])) as Record<Joint, number>;
  const first = modePose("idle", 0, n);
  for (const j of JOINTS) angle[j] = first[j] ?? 0;
  let x = opts.startX ?? 0, vx = 0, y = 0, vy = 0, airborne = false;
  let sway = 0, swayV = 0, bob = 0, bobV = 0, crouch = 0, crouchV = 0, squash = 0, squashV = 0, lean = 0, leanV = 0;
  let prevVx = 0;
  type Foot = { p: Vec; step: null | { from: Vec; to: Vec; t: number; dur: number }; last: number };
  const feet: [Foot, Foot] = [
    { p: [x + sk.ankleL[0], groundY], step: null, last: -1 },
    { p: [x + sk.ankleR[0], groundY], step: null, last: -1 },
  ];
  let jump: null | { at: number; height: number; launched: boolean } = null;

  // blinks: seeded intervals 2.2-5.5 s, sometimes a double blink
  const blinks: number[] = [];
  { const r = rng(seed * 31 + 7); for (let t = 0.8 + r() * 2; t < seconds; t += 2.2 + r() * 3.3) { blinks.push(t); if (r() < 0.2) blinks.push(t + 0.28); } }
  const blinkAt = (t: number) => blinks.reduce((m, b) => { const d = t - b; return d >= 0 && d < 0.16 ? Math.max(m, Math.sin((d / 0.16) * Math.PI)) : m; }, 0);

  const frames: MotionFrame[] = [];
  const total = Math.ceil(seconds * fps);
  const stepsPerFrame = Math.round(1 / fps / MOTION_STEP);
  let t = 0;
  let ai = 0;
  let mode: Mode = "idle", modeAt = 0, walkTo = x, walkSpeed = 0;

  const spring = (v: number, vv: number, target: number, k: number, z: number, dt: number): [number, number] => {
    const a = k * (target - v) - 2 * z * Math.sqrt(k) * vv;
    vv += a * dt;
    return [v + vv * dt, vv];
  };

  for (let f = 0; f < total; f++) {
    for (let s = 0; s < stepsPerFrame; s++) {
      const dt = MOTION_STEP;
      // actions that start now
      while (ai < acts.length && acts[ai]!.at <= t) {
        const a = acts[ai++]!;
        if (a.do === "jump") jump = { at: t, height: a.height ?? 90, launched: false };
        else { mode = a.do; modeAt = t; if (a.do === "walk") { walkTo = a.to ?? x; walkSpeed = a.speed ?? WALK_SPEED; } }
      }
      const since = t - modeAt;
      const pose = modePose(mode, since, n);
      const mood = MOOD[mode] ?? 1;

      // root travel: accelerate toward the walk target, ease to a stop
      const walking = mode === "walk" && Math.abs(walkTo - x) > 2;
      const vTarget = walking ? clamp((walkTo - x) * 2.5, -walkSpeed, walkSpeed) : 0;
      vx += (vTarget - vx) * Math.min(1, dt * 5);
      x += vx * dt;
      const ax = (vx - prevVx) / dt;
      prevVx = vx;

      // jump: crouch (anticipation), launch, fly under gravity, land
      // soft knees: a little bend at rest, so the legs never lock straight
      let crouchTarget = SOFT_KNEES + (pose.crouch ?? 0);
      if (jump && !jump.launched) {
        const k = (t - jump.at) / 0.22;
        crouchTarget = 38;
        if (k >= 1) { jump.launched = true; airborne = true; vy = -Math.sqrt(2 * GRAVITY * jump.height); for (const ft of feet) ft.step = null; }
      }
      if (airborne) {
        vy += GRAVITY * dt; y += vy * dt;
        if (y >= 0 && vy > 0) {
          // landing: stop at the ground, absorb with the knees and a squash
          airborne = false; jump = null;
          crouchV += vy * 0.32; squashV += vy * 0.0006;
          y = 0; vy = 0;
          for (const ft of feet) { ft.p = [ft.p[0], groundY]; ft.last = t; }
        }
        crouchTarget = -8;
      }

      // stepping: a foot steps when it falls behind its home under the hips; the other must be planted
      const homes: [number, number] = [x + sk.ankleL[0] + vx * STEP_SECONDS * 0.5, x + sk.ankleR[0] + vx * STEP_SECONDS * 0.5];
      if (!airborne) {
        for (let i = 0; i < 2; i++) {
          const ft = feet[i]!, other = feet[1 - i]!;
          if (ft.step) {
            ft.step.t += dt;
            const u = clamp(ft.step.t / ft.step.dur, 0, 1), e = u * u * (3 - 2 * u);
            // the foot peels off and sets down gently: zero vertical speed at both ends of the arc
            ft.p = [ft.step.from[0] + (ft.step.to[0] - ft.step.from[0]) * e, groundY - ((1 - Math.cos(2 * Math.PI * u)) / 2) * STEP_LIFT * Math.min(1, Math.abs(ft.step.to[0] - ft.step.from[0]) / 20)];
            if (u >= 1) { ft.p = [ft.step.to[0], groundY]; ft.step = null; ft.last = t; }
          } else if (!other.step && t - other.last > 0.04) {
            const off = homes[i]! - ft.p[0];
            const urgent = Math.abs(off) > (Math.abs(vx) > 5 ? 8 : 14);
            // the foot further behind goes first
            const behind = Math.abs(off) >= Math.abs(homes[1 - i]! - other.p[0]);
            if (urgent && behind) {
              const dur = clamp(STEP_SECONDS * (WALK_SPEED / Math.max(80, Math.abs(vx) + 1)) ** 0.5, 0.2, 0.34);
              ft.step = { from: [...ft.p] as Vec, to: [homes[i]! + vx * dur * 0.5, groundY], t: 0, dur };
            }
          }
        }
      } else {
        // airborne: the feet follow the body, tucked by how high it is (zero at take-off and at landing,
        // so neither snaps); sideways they ease from where they were planted to under the hips
        const tuck = 22 * clamp(-y / (vy < 0 ? 40 : 70), 0, 1);
        const k = Math.min(1, dt * 14);
        feet.forEach((ft, i) => {
          const homeX = x + (i ? sk.ankleR[0] : sk.ankleL[0]);
          ft.p = [ft.p[0] + (homeX - ft.p[0]) * k, groundY + y - tuck];
        });
      }

      // weight shift onto the standing foot, a bob through each step, a lean into acceleration
      const stepping = feet.findIndex((ft) => ft.step);
      const stance = stepping < 0 ? -1 : 1 - stepping;
      const swayTarget = stance < 0 ? (mode === "idle" ? n("sw")(t) * 4 : 0) : (feet[stance]!.p[0] - x - (sk.ankleL[0] + sk.ankleR[0]) / 2) * 0.35;
      [sway, swayV] = spring(sway, swayV, swayTarget, 60, 0.8, dt);
      const lift = stepping < 0 ? 0 : (1 - Math.cos(2 * Math.PI * clamp(feet[stepping]!.step!.t / feet[stepping]!.step!.dur, 0, 1))) / 2;
      [bob, bobV] = spring(bob, bobV, stepping < 0 ? 0 : 4 - lift * 9, 150, 0.7, dt);
      [crouch, crouchV] = spring(crouch, crouchV, crouchTarget, 90 * mood, 0.55, dt);
      [squash, squashV] = spring(squash, squashV, airborne ? -clamp(Math.abs(vy) / 30000, 0, 0.06) : 0, 260, 0.3, dt);
      [lean, leanV] = spring(lean, leanV, clamp(vx * 0.012 - ax * 0.0015, -6, 6) + (pose.torso ?? 0) - sway * 0.08, 90, 0.7, dt);

      // upper-body joints: springs toward the pose, plus lag from the body's acceleration
      for (const j of JOINTS) {
        const [k, z] = SPRING[j];
        if (!k) continue;
        let target = j === "torso" ? lean : pose[j] ?? 0;
        if (j === "head") target += clamp(-ax * 0.0025 + vy * 0.002, -8, 8) - lean * 0.5;
        if (j === "handL" || j === "handR") target += clamp(-ax * 0.003, -10, 10);
        if (airborne && (j === "armL" || j === "armR")) target += (j === "armL" ? 1 : -1) * clamp(-vy * 0.02, -25, 25);
        [angle[j], vel[j]] = spring(angle[j], vel[j], target, k * mood, z, dt);
        // cap joint speed: faster swings strobe at 24 fps instead of reading as motion
        if (Math.abs(vel[j]) > MAX_JOINT_SPEED) { const over = vel[j] - Math.sign(vel[j]) * MAX_JOINT_SPEED; vel[j] -= over; angle[j] -= over * dt; }
      }
      t += dt;
    }

    // legs: IK from the hips (moved by the root, the sway, the bob and the crouch) to the feet
    const rootX = x + sway, rootY = y + bob + crouch;
    const local = (p: Vec): Vec => [p[0] - rootX, p[1] - rootY];
    const L = legIk(sk.hipL, local(feet[0].p), r1L, r2L, -1);
    const R = legIk(sk.hipR, local(feet[1].p), r1R, r2R, 1);
    angle.thighL = L.thigh; angle.shinL = L.shin; angle.thighR = R.thigh; angle.shinR = R.shin;

    const sq = squash;
    frames.push({
      x: rootX, y: rootY, sx: 1 - sq * 0.6, sy: 1 + sq,
      angles: { ...angle }, blink: blinkAt(f / fps),
      feet: [[...feet[0].p] as Vec, [...feet[1].p] as Vec],
      planted: [!feet[0].step && !airborne, !feet[1].step && !airborne],
    });
  }
  return frames;
}
