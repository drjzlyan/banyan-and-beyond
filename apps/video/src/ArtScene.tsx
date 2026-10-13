import type { Shot, SfxId } from "@banyan/core";
import { Img, interpolate, interpolateColors, random, spring } from "remotion";
import rigJson from "../art/rig.json";
import { ART } from "./art.ts";
import { FPS } from "./audio.ts";
import { cameraAt, layerTransform, type Camera } from "./camera.ts";

/**
 * The storybook scene: Inspyry vector art laid out in a 1280×720 world, filmed by a virtual camera
 * (camera.ts) with parallax layers. Sky, hills, sun, moon, stars, clouds, diyas and the temple bell
 * are drawn in code (smooth gradients and faces that stay consistent); the storytellers are cut-out
 * rigs (art/rig.json) whose heads turn, nod and blink. Motion is event-driven (a line starts, a
 * cue fires) rather than everything wobbling at once, so the eye goes to whoever is speaking.
 */
const W = 1280;
const H = 720;
const GROUND = 540;
const INK = "#3b2a17";

type Level = (id: SfxId) => number;
type Who = "AJJA" | "KID";
type Line = { speaker: Who; start: number; end: number; text: string };
type Rig = { viewBox: number[]; pivot: number[]; eyes: number[][]; eyelid: { rx: number; ry: number; fill: string; line: string } };
const RIG = rigJson as unknown as Record<string, Rig>;

/** An art piece anchored at its bottom-centre (x, bottom), `w` px wide; transforms pivot at the base. */
function Piece({ id, x, bottom, w, transform = "", opacity = 1, filter, z }: {
  id: string; x: number; bottom: number; w: number; transform?: string; opacity?: number; filter?: string; z?: number;
}) {
  const src = ART[id];
  if (!src || opacity <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x - w / 2, bottom: H - bottom, width: w, transformOrigin: "50% 100%", transform, opacity: Math.min(1, opacity), filter, zIndex: z }}>
      <Img src={src} style={{ width: "100%", display: "block" }} />
    </div>
  );
}

/** A world layer under the camera. depth 1 = the storytellers' plane; smaller is further away. */
function Layer({ cam, depth, children }: { cam: Camera; depth: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: layerTransform(cam, depth) }}>
      {children}
    </div>
  );
}

/** Blink amount 0..1: every 2.5–5.5 s, ~0.2 s long, sometimes a double blink. */
function blinkAt(time: number, seed: string): number {
  const slot = Math.floor(time / 4);
  for (const n of [slot - 1, slot]) {
    const at = n * 4 + random(`${seed}${n}`) * 2.6;
    const double = random(`${seed}d${n}`) < 0.25;
    for (const t0 of double ? [at, at + 0.3] : [at]) {
      const t = time - t0;
      if (t >= 0 && t < 0.2) return 1 - Math.abs(t - 0.1) / 0.1;
    }
  }
  return 0;
}

/**
 * A cut-out character: body, then the head turning about its neck pivot, with eyelids drawn over
 * the eyes in the art's own coordinates. Falls back to the whole picture if the rig files are missing.
 */
function Character({ id, x, bottom, w, body, tilt, headY, blink, filter }: {
  id: string; x: number; bottom: number; w: number; body: string; tilt: number; headY: number; blink: number; filter?: string;
}) {
  const r = RIG[id];
  const head = ART[`${id}.head`], torso = ART[`${id}.body`];
  if (!r || !head || !torso) return <Piece id={id} x={x} bottom={bottom} w={w} transform={body} filter={filter} z={2} />;
  const [vx, vy, vw, vh] = r.viewBox as [number, number, number, number];
  const h = (w * vh) / vw;
  const px = ((r.pivot[0]! - vx) / vw) * w, py = ((r.pivot[1]! - vy) / vh) * h;
  const lid = r.eyelid;
  const img = { position: "absolute", left: 0, top: 0, width: w, height: h } as const;
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: bottom - h, width: w, height: h, transformOrigin: "50% 100%", transform: body, filter, zIndex: 2 }}>
      <Img src={torso} style={img} />
      <div style={{ ...img, transformOrigin: `${px}px ${py}px`, transform: `translateY(${headY}px) rotate(${tilt}deg)` }}>
        <Img src={head} style={img} />
        {blink > 0.05 && (
          <svg viewBox={r.viewBox.join(" ")} style={img}>
            <defs>{r.eyes.map(([ex, ey], i) => <clipPath key={i} id={`${id}-eye${i}`}><ellipse cx={ex} cy={ey} rx={lid.rx} ry={lid.ry} /></clipPath>)}</defs>
            {r.eyes.map(([ex = 0, ey = 0], i) => {
              const edge = ey - lid.ry + 2 * lid.ry * blink; // the lid comes down from the top
              return (
                <g key={i}>
                  <rect x={ex - lid.rx} y={ey - lid.ry - 2} width={lid.rx * 2} height={edge - (ey - lid.ry) + 2} fill={lid.fill} clipPath={`url(#${id}-eye${i})`} />
                  <path d={`M ${ex - lid.rx * 0.95} ${edge - lid.ry * 0.12} Q ${ex} ${edge + lid.ry * 0.28} ${ex + lid.rx * 0.95} ${edge - lid.ry * 0.12}`}
                    stroke={lid.line} strokeWidth={lid.ry * 0.28} fill="none" strokeLinecap="round" />
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

/** Kawaii eyes + smile + blush, centred on (0,0) at unit scale `s`. */
function Face({ s, sleepy = false }: { s: number; sleepy?: boolean }) {
  return (
    <g strokeLinecap="round" fill="none" stroke={INK} strokeWidth={3.2 * s}>
      {sleepy
        ? <><path d={`M ${-17 * s} ${-4 * s} q ${6 * s} ${6 * s} ${12 * s} 0`} /><path d={`M ${5 * s} ${-4 * s} q ${6 * s} ${6 * s} ${12 * s} 0`} /></>
        : <><circle cx={-11 * s} cy={-4 * s} r={4.2 * s} fill={INK} stroke="none" /><circle cx={11 * s} cy={-4 * s} r={4.2 * s} fill={INK} stroke="none" />
          <circle cx={-9.6 * s} cy={-5.6 * s} r={1.4 * s} fill="#fff" stroke="none" /><circle cx={12.4 * s} cy={-5.6 * s} r={1.4 * s} fill="#fff" stroke="none" /></>}
      <path d={`M ${-6 * s} ${6 * s} q ${6 * s} ${6 * s} ${12 * s} 0`} />
      <ellipse cx={-20 * s} cy={5 * s} rx={6 * s} ry={3.6 * s} fill="#f59e9e" stroke="none" opacity={0.75} />
      <ellipse cx={20 * s} cy={5 * s} rx={6 * s} ry={3.6 * s} fill="#f59e9e" stroke="none" opacity={0.75} />
    </g>
  );
}

function Sun({ x, y, time, opacity }: { x: number; y: number; time: number; opacity: number }) {
  if (opacity <= 0) return null;
  return (
    <g transform={`translate(${x} ${y})`} opacity={Math.min(1, opacity)}>
      <circle r={150} fill="url(#halo)" />
      <g transform={`rotate(${time * 6})`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={-7} y={-88} width={14} height={24} rx={7} fill="#ffb627" stroke={INK} strokeWidth={3} transform={`rotate(${i * 30})`} />
        ))}
      </g>
      <circle r={56} fill="#ffd23f" stroke={INK} strokeWidth={4} />
      <Face s={1.5} />
    </g>
  );
}

function Moon({ x, y, time, opacity }: { x: number; y: number; time: number; opacity: number }) {
  if (opacity <= 0) return null;
  return (
    <g transform={`translate(${x} ${y}) rotate(${Math.sin(time * 0.4) * 4})`} opacity={Math.min(1, opacity)}>
      <circle r={170} fill="url(#halo)" opacity={0.55} />
      <path d="M 18 -58 A 60 60 0 1 0 50 34 A 48 48 0 1 1 18 -58 Z" fill="#fff1a8" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <g transform="translate(-16 4)"><Face s={0.85} sleepy /></g>
      {[0, 1].map((i) => {
        const t = (time * 0.35 + i * 0.5) % 1;
        return <text key={i} x={44 + t * 30} y={-50 - t * 50} fontSize={20 + t * 10} fontWeight={800} fill="#fff6c8" opacity={1 - t}>z</text>;
      })}
    </g>
  );
}

function Star({ x, y, r, time, i, opacity }: { x: number; y: number; r: number; time: number; i: number; opacity: number }) {
  if (opacity <= 0) return null;
  const pts = Array.from({ length: 10 }).map((_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.48 : r;
    return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
  }).join(" ");
  return (
    <g transform={`translate(${x} ${y}) rotate(${Math.sin(time * 0.5 + i) * 8}) scale(${0.88 + 0.12 * Math.sin(time * 2 + i)})`} opacity={opacity}>
      <polygon points={pts} fill="#ffe066" stroke={INK} strokeWidth={r * 0.12} strokeLinejoin="round" />
      {r > 16 && <Face s={r / 60} />}
    </g>
  );
}

function Cloud({ x, y, s, opacity, tint }: { x: number; y: number; s: number; opacity: number; tint: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <path d="M -80 20 a 30 30 0 0 1 10 -50 a 45 45 0 0 1 80 -15 a 35 35 0 0 1 60 25 a 25 25 0 0 1 10 40 Z" fill={tint} />
      <path d="M -70 20 a 25 25 0 0 1 8 -30" stroke="#ffffff" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.7} />
    </g>
  );
}

function Diya({ x, y, time, glow }: { x: number; y: number; time: number; glow: number }) {
  const f = 1 + Math.sin(time * 13 + x) * 0.08;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={0} cy={-28} r={80} fill="url(#halo-diya)" opacity={0.15 + glow * 0.85} />
      <path d={`M 0 ${-46 * f} C 9 -30 9 -20 0 -16 C -9 -20 -9 -30 0 ${-46 * f} Z`} fill="#ffb020" stroke="#e4572e" strokeWidth={2.5} />
      <path d="M 0 -36 C 4 -28 4 -22 0 -19 C -4 -22 -4 -28 0 -36 Z" fill="#fff4b0" />
      <path d="M -30 -14 Q 0 -10 30 -14 Q 26 12 0 12 Q -26 12 -30 -14 Z" fill="#c9622b" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <path d="M -22 -2 Q 0 4 22 -2" stroke="#f2c14e" strokeWidth={3} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Bell({ x, y, swing }: { x: number; y: number; swing: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${swing})`}>
      <line x1={0} y1={-30} x2={0} y2={0} stroke={INK} strokeWidth={4} />
      <path d="M -26 40 Q -26 4 0 2 Q 26 4 26 40 L 32 48 L -32 48 Z" fill="#f2c14e" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M -14 16 Q -12 8 -4 6" stroke="#fff4c2" strokeWidth={4} fill="none" strokeLinecap="round" />
      <circle cx={0} cy={54} r={7} fill="#c98b1a" stroke={INK} strokeWidth={3} />
    </g>
  );
}

const HALO = (id: string, color = "#fff3b0") => (
  <radialGradient id={id}><stop offset="0" stopColor={color} stopOpacity="0.85" /><stop offset="0.45" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
);

/** Foreground banyan leaves hanging into the top corners: frames the shot with depth. */
function Leaves({ time, wind, night, flip }: { time: number; wind: number; night: number; flip: boolean }) {
  const fill = interpolateColors(night, [0, 1], ["#2f6b34", "#13261a"]);
  const light = interpolateColors(night, [0, 1], ["#4f8f45", "#1d3624"]);
  return (
    <g transform={`translate(${flip ? W : 0} 0) scale(${flip ? -1 : 1} 1) rotate(${Math.sin(time * 0.7) * (0.6 + wind * 3)} 0 0)`}>
      <path d="M -20 -20 Q 160 40 250 10 Q 300 -10 330 -20 Z" fill={fill} />
      {Array.from({ length: 11 }).map((_, i) => {
        const x = 10 + i * 26, y = 30 + Math.sin(i * 1.7) * 22 + (i % 3) * 14;
        return <ellipse key={i} cx={x} cy={y} rx={30} ry={15} fill={i % 2 ? light : fill} transform={`rotate(${30 + i * 9} ${x} ${y})`} />;
      })}
      {[0, 1, 2].map((i) => <path key={`r${i}`} d={`M ${60 + i * 70} 20 q ${4 + Math.sin(time + i) * 4} 60 ${-2} ${90 + i * 25}`} stroke="#6b4a2f" strokeWidth={5} fill="none" opacity={0.85} />)}
    </g>
  );
}

export function ArtScene({ time, progress, clips, shots, speaker, open, excited, level, cueStart }: {
  time: number; progress: number; clips: Line[]; shots: Shot[]; speaker: Who | null; open: number; excited: boolean; level: Level; cueStart: (id: SfxId) => number;
}) {
  const frame = Math.round(time * FPS);
  const cam = cameraAt(shots, time);
  const rain = level("rain");
  const wind = level("wind");
  // sunny afternoon -> golden evening -> starry night over the chapter
  const night = Math.min(1, progress * 1.1 + rain * 0.25);
  const dusk = Math.max(0, 1 - Math.abs(night - 0.45) / 0.3); // peaks at golden hour
  const sky = (a: string, b: string, c: string) => interpolateColors(night, [0, 0.5, 1], [a, b, c]);
  const dim = `brightness(${interpolate(night, [0, 1], [1, 0.6])}) saturate(${interpolate(night, [0, 1], [1, 0.8])})`;
  const sway = (i: number, amp: number) => Math.sin(time * 0.6 + i) * amp * (1 + wind * 4);

  // --- performance: springs on line start/end so motion has anticipation, overshoot and settle ---
  const lastLine = (who: Who) => { let l: Line | null = null; for (const c of clips) { if (c.speaker === who && c.start <= time) l = c; } return l; };
  const sp = (at: number, damping = 12, stiffness = 120) => spring({ frame: frame - Math.round(at * FPS), fps: FPS, config: { damping, stiffness } });
  const talk = (who: Who) => { const l = lastLine(who); return l ? sp(l.start) - sp(l.end, 16) : 0; };
  /** two little nods after the other character finishes a line */
  const nod = (who: Who) => {
    const l = lastLine(who === "AJJA" ? "KID" : "AJJA");
    const t = l ? time - l.end : 99;
    return t >= 0 && t < 0.9 ? Math.sin((t / 0.9) * Math.PI * 2) * (1 - t / 0.9) : 0;
  };
  const hop = (() => { // the Kid bounces on an excited line, decaying like a real jump
    const l = lastLine("KID");
    if (!l || !/[?!]\s*$/.test(l.text)) return 0;
    const t = time - l.start;
    return t >= 0 && t < 1.6 ? Math.abs(Math.sin(t * Math.PI * 2.2)) * 24 * Math.exp(-t * 1.8) : 0;
  })();
  const actor = (who: Who, dir: number) => {
    const k = talk(who), voice = speaker === who ? open : 0, n = nod(who);
    const breathe = Math.sin(time * 1.7 + (who === "KID" ? 1.3 : 0)) * 0.008;
    const squash = voice * 0.02 + breathe;
    return {
      body: `translateY(${-(who === "KID" ? hop : 0)}px) rotate(${dir * 2.2 * k}deg) scale(${1 - squash * 0.5}, ${1 + squash})`,
      tilt: dir * (3 * k + voice * 1.5) + Math.sin(time * 0.45 + (who === "KID" ? 2 : 0)) * 0.8 + n * 1.5,
      headY: -voice * 4 + n * 5,
      blink: blinkAt(time, who),
    };
  };
  const ajja = actor("AJJA", 1), kid = actor("KID", -1);
  // the diyas light the storytellers at night: a warm rim on the side facing the lamps
  const rim = (dx: number) => (night > 0.3 ? `drop-shadow(${dx}px -1px 0 rgba(255,196,110,${((night - 0.3) * 1.2).toFixed(2)}))` : undefined);

  const sunY = interpolate(progress, [0, 0.55], [120, 430], { extrapolateRight: "clamp" });
  const moonY = interpolate(progress, [0.35, 1], [430, 120], { extrapolateLeft: "clamp" });
  const puppyPerk = Math.max(level("knock"), level("drum"), level("bell"), excited ? 0.6 : 0);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: sky("#d9f3ff", "#ffd59e", "#41548f") }}>
      {/* sky: barely moves with the camera */}
      <Layer cam={cam} depth={0.06}>
        <div style={{ position: "absolute", left: -200, top: -200, width: W + 400, height: H + 400,
          background: `linear-gradient(${sky("#5bb8f0", "#f08a5d", "#141c40")}, ${sky("#d9f3ff", "#ffd59e", "#41548f")} 75%)` }} />
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>{HALO("halo")}
            <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff6c8" stopOpacity="0.55" /><stop offset="1" stopColor="#fff6c8" stopOpacity="0" /></linearGradient>
          </defs>
          {/* god rays from the low sun at golden hour */}
          {dusk > 0 && night < 0.7 && (
            <g transform={`translate(1080 ${sunY}) rotate(${Math.sin(time * 0.15) * 3})`} opacity={dusk * 0.6}>
              {[-62, -48, -30, -14, 4, 20].map((a, i) => <path key={i} d={`M 0 0 L ${-30 - i * 4} 900 L ${30 + i * 6} 900 Z`} fill="url(#ray)" transform={`rotate(${a + 90})`} />)}
            </g>
          )}
          {Array.from({ length: 24 }).map((_, i) => (
            <Star key={i} i={i} time={time} x={40 + random(`sx${i}`) * (W - 80)} y={20 + random(`sy${i}`) * 250} r={i < 3 ? 24 : 6 + random(`sr${i}`) * 7}
              opacity={Math.min(1, Math.max(0, night - 0.5) * 2.2) * (0.75 + 0.25 * Math.sin(time * 1.5 + i))} />
          ))}
          <Sun x={1080} y={sunY} time={time} opacity={1 - night * 1.6} />
          <Moon x={1060} y={moonY} time={time} opacity={(night - 0.4) * 2.5} />
        </svg>
      </Layer>

      {/* clouds and the kite drift a little in front of the sky */}
      <Layer cam={cam} depth={0.15}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {[0, 1, 2, 3].map((i) => (
            <Cloud key={i} x={((i * 400 + time * (6 + i * 3) * (1 + wind * 5)) % (W + 400)) - 200} y={70 + (i % 3) * 55} s={1 - (i % 2) * 0.3}
              opacity={0.95 - night * 0.55} tint={interpolateColors(Math.max(rain, night * 0.6), [0, 1], ["#ffffff", "#9aa6c2"])} />
          ))}
        </svg>
        <Piece id="kite" x={230 + Math.sin(time * 0.35) * 40} bottom={250 - wind * 60 + Math.sin(time * 0.7) * 14} w={74 + wind * 10}
          opacity={1 - night * 1.3} transform={`rotate(${Math.sin(time * 1.1) * (7 + wind * 15)}deg)`} />
      </Layer>

      {/* far and near hills */}
      <Layer cam={cam} depth={0.3}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <path d={`M-200 ${GROUND - 120} C 220 ${GROUND - 200} 420 ${GROUND - 90} 640 ${GROUND - 140} S 1060 ${GROUND - 210} ${W + 200} ${GROUND - 130} V ${H + 200} H -200 Z`} fill={sky("#b4dd98", "#d1b98a", "#2f4739")} />
        </svg>
      </Layer>
      <Layer cam={cam} depth={0.5}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <path d={`M-200 ${GROUND - 60} C 260 ${GROUND - 120} 520 ${GROUND - 40} 780 ${GROUND - 80} S 1120 ${GROUND - 110} ${W + 200} ${GROUND - 70} V ${H + 200} H -200 Z`} fill={sky("#8acb72", "#b0aa66", "#25392c")} />
        </svg>
        {/* village on the hill; the bell rings and the door knocks on cue */}
        <div style={{ filter: dim }}>
          <Piece id="temple" x={150} bottom={GROUND - 30} w={190} />
          <Piece id="hut" x={1120} bottom={GROUND - 15} w={250} transform={level("knock") ? `translateX(${Math.sin(time * 50) * 4 * level("knock")}px)` : ""} />
          <Piece id="mango_tree" x={975} bottom={GROUND - 25} w={200} transform={`rotate(${sway(2, 0.5)}deg)`} />
        </div>
        {level("bell") > 0 && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: level("bell") }}>
          <Bell x={150} y={330} swing={Math.sin(time * 9) * 25} />
          {[0, 1, 2].map((i) => <circle key={i} cx={150} cy={370} r={40 + ((time * 80 + i * 30) % 90)} fill="none" stroke="#ffe066" strokeWidth={4}
            opacity={1 - ((time * 80 + i * 30) % 90) / 90} />)}
        </svg>}
      </Layer>

      {/* the storytellers' plane: ground, banyan, animals, diyas, characters */}
      <Layer cam={cam} depth={1}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>{HALO("shadow", "#1d2a12")}</defs>
          <rect x={-200} y={GROUND} width={W + 400} height={H - GROUND + 200} fill={sky("#6cb85a", "#8fa257", "#1f3324")} />
          {Array.from({ length: 26 }).map((_, i) => (
            <circle key={i} cx={random(`gx${i}`) * W} cy={GROUND + 10 + random(`gy${i}`) * 150} r={4 + random(`gr${i}`) * 3}
              fill={["#ffd23f", "#ff8fab", "#ffffff"][i % 3]} opacity={0.85 - night * 0.5} />
          ))}
          {/* soft contact shadows ground everything */}
          <ellipse cx={640} cy={GROUND + 26} rx={250} ry={26} fill="url(#shadow)" opacity={0.6} />
          <ellipse cx={370} cy={GROUND + 93} rx={170} ry={22} fill="url(#shadow)" opacity={0.7} />
          <ellipse cx={900} cy={GROUND + 98} rx={150} ry={20} fill="url(#shadow)" opacity={0.7} />
        </svg>
        <Piece id="banyan" x={640} bottom={GROUND + 30} w={740} filter={dim} transform={`rotate(${sway(0, 0.25)}deg) skewX(${sway(1, 0.3)}deg)`} />
        <Piece id="parrot" x={810} bottom={300} w={68} filter={dim}
          transform={`scaleX(${Math.floor(time / 5) % 3 === 2 ? -1 : 1}) translateY(${-Math.abs(Math.sin(time * 8)) * (time % 5 < 0.6 ? 6 : 0)}px)`} />
        <Piece id="cow" x={1185} bottom={GROUND + 55} w={170} filter={dim} transform={`scaleY(${1 + Math.sin(time * 1.2) * 0.012})`} />
        {(() => { // a peacock strolls across now and then
          const t = (time + 6) % 40;
          return t > 14 ? null : <Piece id="peacock" x={-120 + t * 110} bottom={GROUND + 40} w={150} filter={dim} transform={`translateY(${-Math.abs(Math.sin(t * 5)) * 5}px)`} />;
        })()}
        <Piece id="butterfly" x={300 + Math.sin(time * 0.4) * 200} bottom={330 + Math.sin(time * 0.9) * 60} w={44}
          opacity={1 - night * 1.4} transform={`rotate(${Math.sin(time * 1.3) * 12}deg) scaleX(${0.45 + Math.abs(Math.sin(time * 9)) * 0.55})`} />

        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible", zIndex: 3 }}>
          <defs>{HALO("halo-diya", "#ffd27a")}</defs>
          <Diya x={590} y={GROUND + 52} time={time} glow={night} />
          <Diya x={690} y={GROUND + 52} time={time + 0.4} glow={night} />
          {level("footsteps") > 0 && Array.from({ length: 6 }).map((_, i) =>
            (time - cueStart("footsteps")) * 3 > i ? <ellipse key={i} cx={460 + i * 70} cy={GROUND + 150 + (i % 2) * 20} rx={14} ry={20} fill={INK} opacity={0.35 * level("footsteps")} /> : null)}
        </svg>
        <Character id="ajja" x={370} bottom={GROUND + 95} w={290} filter={rim(3)} {...ajja} />
        <Character id="kid" x={900} bottom={GROUND + 100} w={250} filter={rim(-3)} {...kid} />
        <Piece id="puppy" x={1075} bottom={GROUND + 98} w={110} z={2}
          transform={`translateY(${-Math.abs(Math.sin(time * 9)) * 10 * puppyPerk}px) rotate(${Math.sin(time * 1.5) * 1.5}deg)`} />
      </Layer>

      {/* foreground: marigolds and overhanging leaves frame the shot (kept sharp: blur cost ~90 ms a frame) */}
      <Layer cam={cam} depth={1.3}>
        <Piece id="marigolds" x={40} bottom={H + 20} w={250} transform={`rotate(${sway(3, 0.5)}deg)`} />
        <Piece id="marigolds" x={1250} bottom={H + 20} w={230} transform={`scaleX(-1) rotate(${sway(4, 0.5)}deg)`} />
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <Leaves time={time} wind={wind} night={night} flip={false} />
          <Leaves time={time + 2} wind={wind} night={night} flip />
        </svg>
      </Layer>

      {/* sound-effect visuals in screen space, so they read in any shot */}
      <Fx level={level} cueStart={cueStart} time={time} />

      {/* grade: warm at golden hour, cool at night, and a vignette */}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs><radialGradient id="vig" cx="50%" cy="45%" r="75%"><stop offset="0.55" stopColor="#120c04" stopOpacity="0" /><stop offset="1" stopColor="#120c04" stopOpacity="0.55" /></radialGradient></defs>
        <rect width={W} height={H} fill="#ff9a3c" opacity={dusk * 0.08} />
        <rect width={W} height={H} fill="#1c2a6b" opacity={Math.max(0, night - 0.55) * 0.18} />
        <rect width={W} height={H} fill="url(#vig)" opacity={0.6 + night * 0.4} />
      </svg>
    </div>
  );
}

function Fx({ level, cueStart, time }: { level: Level; cueStart: (id: SfxId) => number; time: number }) {
  const birds = level("birds"), rain = level("rain"), drum = level("drum"), flute = level("flute");
  const chime = level("chime"), splash = Math.max(level("splash"), level("river")), wind = level("wind"), crickets = level("crickets");
  const pop = (id: SfxId) => spring({ frame: Math.round((time - cueStart(id)) * FPS), fps: FPS, config: { damping: 9, stiffness: 140 } });
  return (
    <>
      {birds > 0 && [0, 1, 2, 3].map((i) => (
        <Piece key={i} id="bird" x={-80 + (time - cueStart("birds")) * (240 + i * 40) + i * 90} bottom={200 + i * 40 + Math.sin(time * 4 + i) * 12} w={70 - i * 6}
          opacity={birds} transform={`scaleY(${0.75 + Math.abs(Math.sin(time * 12 + i)) * 0.35})`} z={4} />
      ))}
      {rain > 0 && <>
        {[0, 1, 2].map((i) => <Piece key={i} id="rain_cloud" x={260 + i * 380 + Math.sin(time * 0.5 + i) * 20} bottom={240 + (i % 2) * 30} w={280} opacity={rain} z={4} />)}
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: rain * 0.8, zIndex: 4 }}>
          {Array.from({ length: 80 }).map((_, i) => {
            const x = (random(`rx${i}`) * W + time * 40) % W, y = (random(`ry${i}`) * H + time * 650) % H;
            return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 20} stroke="#cfe6ff" strokeWidth={3} strokeLinecap="round" />;
          })}
        </svg>
      </>}
      {drum > 0 && <Piece id="dholak" x={640} bottom={H - 150} w={170} opacity={drum} z={4} transform={`scale(${pop("drum") * (1 + Math.abs(Math.sin(time * 8)) * 0.08)})`} />}
      {flute > 0 && <>
        <Piece id="flute" x={560} bottom={300} w={210} opacity={flute} z={4} transform={`scale(${pop("flute")}) rotate(${Math.sin(time * 2) * 5}deg)`} />
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: flute, zIndex: 4 }}>
          {[0, 1, 2, 3].map((i) => {
            const t = (time * 0.6 + i / 4) % 1;
            return <text key={i} x={600 + t * 160 + Math.sin(t * 9 + i) * 20} y={300 - t * 140} fontSize={36} fill="#7a3fa0" opacity={1 - t}>{i % 2 ? "♪" : "♫"}</text>;
          })}
        </svg>
      </>}
      {splash > 0 && <Piece id="splash" x={640} bottom={H - 140} w={220} opacity={splash} z={4} transform={`scale(${pop(level("splash") ? "splash" : "river")})`} />}
      {(chime > 0 || crickets > 0) && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, zIndex: 4 }}>
        {chime > 0 && Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * Math.PI * 2 + time * 1.2, r = 200 + Math.sin(time * 3 + i) * 30;
          return <Star key={i} i={i} time={time} x={640 + Math.cos(a) * r * 1.7} y={320 + Math.sin(a) * r * 0.8} r={20} opacity={chime} />;
        })}
        {crickets > 0 && Array.from({ length: 18 }).map((_, i) => (
          <circle key={i} cx={120 + random(`fx${i}`) * 1040 + Math.sin(time * 0.5 + i) * 40} cy={240 + random(`fy${i}`) * 300 + Math.cos(time * 0.7 + i * 2) * 25}
            r={5} fill="#fff27a" opacity={crickets * (Math.sin(time * 3 + i * 1.3) + 1) / 2} />
        ))}
      </svg>}
      {wind > 0 && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: wind, zIndex: 4 }}>
        {Array.from({ length: 14 }).map((_, i) => {
          const x = ((random(`lx${i}`) * W) + time * 330) % (W + 80) - 40, y = 160 + random(`ly${i}`) * 360 + Math.sin(time * 3 + i) * 30;
          return <ellipse key={i} cx={x} cy={y} rx={11} ry={5} fill="#6cbf4a" transform={`rotate(${time * 200 + i * 40} ${x} ${y})`} />;
        })}
        {[0, 1, 2].map((i) => {
          const x = ((time * 260 + i * 420) % (W + 300)) - 150, y = 180 + i * 90;
          return <path key={`w${i}`} d={`M ${x} ${y} q 60 -30 120 0 t 120 0 q 30 -40 0 -50`} stroke="#ffffff" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.8} />;
        })}
      </svg>}
    </>
  );
}
