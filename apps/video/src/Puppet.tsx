import type { MotionFrame, Skeleton } from "@banyan/core";
import { Img } from "remotion";
import rigJson from "../art/cast-rig.json";

/**
 * Cut-out puppets for story characters. Each character is cut into parts by scripts/rig-cast.mjs;
 * every part SVG keeps the source's viewBox, so the parts stack exactly and a joint is a CSS
 * rotation about its pivot (as a percentage of the shared box). Parts nest by `parent` (torso ->
 * shoulder -> elbow -> wrist, hip -> knee), and a child below its parent's z is drawn behind it.
 * The angles come from the motion model (core/motion.ts: springs, leg IK, gravity), sampled per
 * frame. Renderer rules kept: transforms only, every part inside its own box, no blend modes.
 */

type Part = { pivot: [number, number]; z: number; parent?: string };
type Rig = { viewBox: [number, number, number, number]; parts: Record<string, Part>; plaits?: { x: number; y0: number; y1: number; w: number }[] };
const { $comment, ...RIGS } = rigJson as unknown as Record<string, Rig> & { $comment: string };
void $comment;

const URLS = import.meta.glob("./art/cast/*.svg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const partUrl = (id: string, part: string) => URLS[`./art/cast/${id}.${part}.svg`];

export const hasPuppet = (id: string) => !!RIGS[id];

/** The motion model's skeleton for a character (hips, knees, ankles at rest), from cast-rig.json. */
export const skeletonOf = (id: string) => (RIGS[id] as unknown as { skeleton?: Skeleton }).skeleton ?? null;

/** Eyes and mouth in source units, for blinks and talking (girl pilot, measured on the grid render). */
const FACE: Record<string, { eyes: [number, number][]; eye: [number, number]; lid: string; mouth: [number, number]; mouthW: number }> = {
  girl: { eyes: [[462, 330], [573, 330]], eye: [27, 25], lid: "#6b4423", mouth: [516, 377], mouthW: 26 },
};

export function Puppet({ id, frame, height, open = 0 }: {
  id: string;
  /** one sample of simulateMotion: root offset, squash, joint angles, blink */
  frame: MotionFrame;
  height: number;
  /** mouth opening 0..1 from the voice envelope */
  open?: number;
}) {
  const rig = RIGS[id];
  if (!rig) return null;
  const [vx, vy, vw, vh] = rig.viewBox;
  const width = (height * vw) / vh;
  const unit = width / vw;
  const origin = ([px, py]: [number, number]) => `${((px - vx) / vw) * 100}% ${((py - vy) / vh) * 100}%`;
  const parts = Object.entries(rig.parts);
  const children = (name: string | undefined) => parts.filter(([, p]) => p.parent === name).sort((a, b) => a[1].z - b[1].z);
  const face = FACE[id];
  const angle = (name: string) => (frame.angles as Record<string, number>)[name] ?? 0;
  const layer = (name: string): React.ReactNode => {
    const part = rig.parts[name]!;
    const kids = children(name);
    // the torso also carries the squash and stretch of the upper body
    const extra = name === "torso" ? ` scale(${frame.sx}, ${frame.sy})` : "";
    return (
      <div key={name} style={{ position: "absolute", inset: 0, transformOrigin: origin(part.pivot), transform: `rotate(${angle(name)}deg)${extra}` }}>
        {kids.filter(([, k]) => k.z < part.z).map(([k]) => layer(k))}
        <Img src={partUrl(id, name)!} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        {name === "head" && face && <FaceLayer rig={rig} face={face} blink={frame.blink} open={open} />}
        {kids.filter(([, k]) => k.z >= part.z).map(([k]) => layer(k))}
      </div>
    );
  };
  return (
    <div style={{ position: "relative", width, height }}>
      <div style={{ position: "absolute", inset: 0, transform: `translate(${frame.x * unit}px, ${frame.y * unit}px)` }}>
        {children(undefined).map(([k]) => layer(k))}
      </div>
    </div>
  );
}

function FaceLayer({ rig, face, blink, open }: { rig: Rig; face: (typeof FACE)[string]; blink: number; open: number }) {
  const [vx, vy, vw, vh] = rig.viewBox;
  return (
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
      {blink > 0.05 && face.eyes.map(([ex, ey], i) => (
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
  );
}
