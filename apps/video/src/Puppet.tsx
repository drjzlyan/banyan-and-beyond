import { Img } from "remotion";
import rigJson from "../art/cast-rig.json";

/**
 * Cut-out puppets for story characters (Phase 1 pilot). Each character is cut into parts by
 * scripts/rig-cast.mjs; every part SVG keeps the source's viewBox, so the parts stack exactly and a
 * joint is just a CSS rotation about its pivot (as a percentage of the shared box). Limbs nest
 * (shoulder -> elbow), so a forearm follows its upper arm. Poses are angle sets keyed by time and
 * blended over BLEND_SECONDS when the pose changes. Renderer rules kept: transforms only, every part
 * inside its own box, no blend modes or CSS gradients.
 */

type Part = { pivot: [number, number]; z: number; parent?: string };
type Rig = { viewBox: [number, number, number, number]; parts: Record<string, Part>; plaits?: { x: number; y0: number; y1: number; w: number }[] };
const { $comment, ...RIGS } = rigJson as unknown as Record<string, Rig> & { $comment: string };
void $comment;

const URLS = import.meta.glob("./art/cast/*.svg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const partUrl = (id: string, part: string) => URLS[`./art/cast/${id}.${part}.svg`];

export const hasPuppet = (id: string) => !!RIGS[id];

/** Joint angles in degrees (CSS: positive is clockwise on screen) plus whole-body motion. */
export type Angles = {
  head: number; armL: number; foreL: number; armR: number; foreR: number; legL: number; legR: number;
  /** body lift in source units (negative is up), lean in degrees, and a breathing squash */
  lift: number; lean: number; squash: number;
};
export type PoseName = "idle" | "walk" | "run" | "wave" | "point" | "cheer" | "sad" | "surprised" | "laugh";
export const POSES: PoseName[] = ["idle", "walk", "run", "wave", "point", "cheer", "sad", "surprised", "laugh"];

const DOWN = 74; // arms resting at the sides (the art is drawn in a T-pose)

/** One pose at time t (seconds since the pose began). Pure, so every render matches. */
export function poseAt(pose: PoseName, t: number): Angles {
  const s = (f: number, ph = 0) => Math.sin(t * f * Math.PI * 2 + ph);
  const breathe = s(0.35) * 0.012;
  switch (pose) {
    case "walk": {
      const w = s(1.6);
      return { head: s(1.6, 0.5) * 2, armL: -DOWN + w * 16, foreL: -10, armR: DOWN + w * 16, foreR: 10, legL: w * 14, legR: -w * 14,
        lift: -Math.abs(s(1.6)) * 7, lean: 2, squash: 0 };
    }
    case "run": {
      const w = s(2.6);
      return { head: s(2.6, 0.5) * 3, armL: -DOWN + 20 + w * 30, foreL: 45, armR: DOWN - 20 + w * 30, foreR: -45, legL: w * 26, legR: -w * 26,
        lift: -Math.abs(s(2.6)) * 16, lean: 7, squash: 0 };
    }
    case "wave":
      return { head: 4 + s(0.5) * 2, armL: -DOWN, foreL: -6, armR: -58, foreR: -28 + s(2.2) * 24, legL: 0, legR: 0, lift: 0, lean: -2, squash: breathe };
    case "point":
      return { head: 5, armL: -DOWN, foreL: -6, armR: -4 + s(0.5) * 2, foreR: 0, legL: -3, legR: 3, lift: 0, lean: 3, squash: breathe };
    case "cheer": {
      const hop = Math.abs(s(1.4));
      return { head: s(1.4) * 4, armL: 42 + s(2.8) * 8, foreL: 18, armR: -42 - s(2.8) * 8, foreR: -18, legL: hop * 9, legR: -hop * 9,
        lift: -hop * 46, lean: 0, squash: (1 - hop) * 0.03 };
    }
    case "sad":
      return { head: 9, armL: -84, foreL: 4, armR: 84, foreR: -4, legL: 2, legR: -2, lift: 10, lean: -2, squash: 0.02 + breathe };
    case "surprised": {
      const jolt = Math.exp(-t * 5) * Math.sin(t * 30) * 6;
      return { head: -4 + jolt * 0.4, armL: -32, foreL: 72, armR: 32, foreR: -72, legL: -4, legR: 4, lift: -Math.max(0, Math.exp(-t * 6)) * 24, lean: -4, squash: -0.02 };
    }
    case "laugh":
      return { head: s(3.2) * 5, armL: -60, foreL: -55, armR: 60, foreR: 55, legL: 0, legR: 0, lift: -Math.abs(s(3.2)) * 9, lean: s(1.6) * 3, squash: Math.abs(s(3.2)) * 0.025 };
    case "idle":
    default:
      return { head: s(0.25) * 2.5, armL: -DOWN + s(0.35) * 2, foreL: -6, armR: DOWN - s(0.35) * 2, foreR: 6, legL: 0, legR: 0, lift: 0, lean: s(0.2) * 1.2, squash: breathe };
  }
}

export const BLEND_SECONDS = 0.35;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** The pose on screen: blends from the previous pose into the current one. */
export function blendPose(prev: PoseName | null, pose: PoseName, since: number): Angles {
  const cur = poseAt(pose, since);
  if (!prev || since >= BLEND_SECONDS) return cur;
  const from = poseAt(prev, since + 10), k = ease(since / BLEND_SECONDS);
  return Object.fromEntries(Object.keys(cur).map((key) => [key, from[key as keyof Angles] + (cur[key as keyof Angles] - from[key as keyof Angles]) * k])) as Angles;
}

/** Eyes and mouth in source units, for blinks and talking (girl pilot, measured on the grid render). */
const FACE: Record<string, { eyes: [number, number][]; eye: [number, number]; lid: string; mouth: [number, number]; mouthW: number }> = {
  girl: { eyes: [[462, 330], [573, 330]], eye: [27, 25], lid: "#6b4423", mouth: [516, 377], mouthW: 26 },
};

export function Puppet({ id, angles, height, blink = 0, open = 0, flip = false }: {
  id: string; angles: Angles; height: number;
  /** 0 open .. 1 shut */
  blink?: number;
  /** mouth opening 0..1 from the voice envelope */
  open?: number;
  /** face left instead of right */
  flip?: boolean;
}) {
  const rig = RIGS[id];
  if (!rig) return null;
  const [vx, vy, vw, vh] = rig.viewBox;
  const width = (height * vw) / vh;
  const origin = ([px, py]: [number, number]) => `${((px - vx) / vw) * 100}% ${((py - vy) / vh) * 100}%`;
  const layer = (name: string, deg: number, children?: React.ReactNode) => (
    <div key={name} style={{ position: "absolute", inset: 0, transformOrigin: origin(rig.parts[name]!.pivot), transform: `rotate(${deg}deg)` }}>
      <Img src={partUrl(id, name)!} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {children}
    </div>
  );
  const a = angles;
  const face = FACE[id];
  const unit = width / vw;
  const hips = rig.parts.torso!.pivot;
  return (
    <div style={{ position: "relative", width, height, transform: flip ? "scaleX(-1)" : undefined }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: origin(hips),
        transform: `translateY(${a.lift * unit}px) rotate(${a.lean}deg) scale(${1 + a.squash}, ${1 - a.squash})` }}>
        {layer("legL", a.legL)}
        {layer("legR", a.legR)}
        {layer("armL", a.armL, layer("foreL", a.foreL))}
        {layer("armR", a.armR, layer("foreR", a.foreR))}
        {layer("torso", 0)}
        {layer("head", a.head, face && (
          <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {/* braid segments where the source braid crossed the T-posed arm: two plait lumps each */}
            {rig.plaits?.map((p, i) => {
              const step = (p.y1 - p.y0) / 2;
              return [0, 1].map((k) => {
                const cy = p.y0 + step * (k + 0.5);
                return (
                  <g key={`${i}${k}`}>
                    <ellipse cx={p.x} cy={cy} rx={p.w / 2} ry={step / 2 + 3} fill="#3b2a17" />
                    <path d={`M ${p.x - p.w * 0.32} ${cy - step * 0.25} q ${p.w * 0.3} ${step * 0.35} ${p.w * 0.6} ${step * 0.1}`} stroke="#6b4423" strokeWidth={4} fill="none" strokeLinecap="round" />
                  </g>
                );
              });
            })}
            {blink > 0 && face.eyes.map(([ex, ey], i) => (
              <g key={i}>
                <rect x={ex - face.eye[0]} y={ey - face.eye[1]} width={face.eye[0] * 2} height={face.eye[1] * 2 * blink} rx={face.eye[0] * 0.6} fill={face.lid} />
                {blink > 0.6 && <path d={`M ${ex - face.eye[0] * 0.9} ${ey - face.eye[1] + face.eye[1] * 2 * blink} q ${face.eye[0] * 0.9} 6 ${face.eye[0] * 1.8} 0`} stroke="#3b2a17" strokeWidth={4} fill="none" strokeLinecap="round" />}
              </g>
            ))}
            {open > 0.08 && (
              <g>
                <ellipse cx={face.mouth[0]} cy={face.mouth[1] + 4} rx={face.mouthW * (0.75 + open * 0.25)} ry={4 + open * 16} fill="#3b2a17" />
                <ellipse cx={face.mouth[0]} cy={face.mouth[1] + 8 + open * 6} rx={face.mouthW * 0.45} ry={2 + open * 6} fill="#c0473a" />
              </g>
            )}
          </svg>
        ))}
      </div>
    </div>
  );
}
