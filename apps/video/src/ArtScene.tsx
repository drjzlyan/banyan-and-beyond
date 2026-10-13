import type { SfxId } from "@banyan/core";
import { Img, interpolate, interpolateColors, random } from "remotion";
import { ART } from "./art.ts";

/**
 * The storybook scene built from Inspyry vector art: sky, hills, sun, moon, stars, clouds, diyas and
 * the bell are drawn in code (smooth gradients and cute faces that stay consistent), every other
 * object is a generated SVG placed and animated here.
 */
const W = 1280;
const H = 720;
const GROUND = 540;
const INK = "#3b2a17";

type Level = (id: SfxId) => number;

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
      <circle r={130} fill="url(#halo)" />
      <g transform={`rotate(${time * 12})`}>
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
    <g transform={`translate(${x} ${y}) rotate(${Math.sin(time * 0.6) * 5})`} opacity={Math.min(1, opacity)}>
      <circle r={150} fill="url(#halo)" opacity={0.6} />
      <path d="M 18 -58 A 60 60 0 1 0 50 34 A 48 48 0 1 1 18 -58 Z" fill="#fff1a8" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <g transform="translate(-16 4)"><Face s={0.85} sleepy /></g>
      {/* little "z"s drift up from the sleepy moon */}
      {[0, 1].map((i) => {
        const t = (time * 0.5 + i * 0.5) % 1;
        return <text key={i} x={44 + t * 30} y={-50 - t * 50} fontSize={20 + t * 10} fontWeight={800} fill="#fff6c8" opacity={1 - t}>z</text>;
      })}
    </g>
  );
}

function Star({ x, y, r, time, i, opacity }: { x: number; y: number; r: number; time: number; i: number; opacity: number }) {
  const pts = Array.from({ length: 10 }).map((_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.48 : r;
    return `${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
  }).join(" ");
  return (
    <g transform={`translate(${x} ${y}) rotate(${Math.sin(time + i) * 10}) scale(${0.85 + 0.15 * Math.sin(time * 3 + i)})`} opacity={opacity}>
      <polygon points={pts} fill="#ffe066" stroke={INK} strokeWidth={r * 0.12} strokeLinejoin="round" />
      {r > 16 && <Face s={r / 60} />}
    </g>
  );
}

function Cloud({ x, y, s, opacity, tint }: { x: number; y: number; s: number; opacity: number; tint: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <path d="M -80 20 a 30 30 0 0 1 10 -50 a 45 45 0 0 1 80 -15 a 35 35 0 0 1 60 25 a 25 25 0 0 1 10 40 Z" fill={tint} stroke="#ffffff" strokeOpacity={0.6} strokeWidth={4} />
    </g>
  );
}

function Diya({ x, y, time, glow }: { x: number; y: number; time: number; glow: number }) {
  const f = 1 + Math.sin(time * 13 + x) * 0.08;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={0} cy={-28} r={70} fill="url(#halo-diya)" opacity={0.2 + glow * 0.8} />
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

export function ArtScene({ time, progress, speaker, open, excited, level, cueStart }: {
  time: number; progress: number; speaker: "AJJA" | "KID" | null; open: number; excited: boolean; level: Level; cueStart: (id: SfxId) => number;
}) {
  const rain = level("rain");
  const wind = level("wind");
  // sunny afternoon -> golden evening -> starry night over the chapter
  const night = Math.min(1, progress * 1.1 + rain * 0.25);
  const sky = (a: string, b: string, c: string) => interpolateColors(night, [0, 0.5, 1], [a, b, c]);
  const skyTop = sky("#6cc4f5", "#f39a6b", "#1c2650");
  const skyBottom = sky("#d9f3ff", "#ffd59e", "#41548f");
  // scenery dims a little at night; characters stay bright (the diyas light them)
  const dim = `brightness(${interpolate(night, [0, 1], [1, 0.62])}) saturate(${interpolate(night, [0, 1], [1, 0.8])})`;
  const sway = (i: number, amp: number) => Math.sin(time * 0.8 + i) * amp * (1 + wind * 3);

  const breathe = (o: number) => 1 + Math.sin(time * 1.6 + o) * 0.015;
  // the speaker bounces with their voice and leans in; the listener nods along
  const bob = (who: "AJJA" | "KID") => (speaker === who ? -Math.abs(Math.sin(time * 7)) * 5 - open * 10 : 0);
  const lean = (who: "AJJA" | "KID", dir: number) => (speaker === who ? dir * (2 + open * 3) : 0);
  const nod = (who: "AJJA" | "KID") => (speaker && speaker !== who ? Math.sin(time * 2.4) * 2 : 0);
  const cheer = speaker === "KID" && excited ? Math.abs(Math.sin(time * 8)) * 22 : 0;
  const halo = (who: "AJJA" | "KID") => (speaker === who ? 0.55 + open * 0.45 : 0);

  const sunY = interpolate(progress, [0, 0.55], [120, 420], { extrapolateRight: "clamp" });
  const moonY = interpolate(progress, [0.35, 1], [430, 120], { extrapolateLeft: "clamp" });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* sky, sun/moon, stars, clouds, hills — drawn in code */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${skyTop}, ${skyBottom})` }} />
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs><radialGradient id="halo"><stop offset="0" stopColor="#fff3b0" stopOpacity="0.8" /><stop offset="1" stopColor="#fff3b0" stopOpacity="0" /></radialGradient></defs>
        {Array.from({ length: 22 }).map((_, i) => (
          <Star key={i} i={i} time={time} x={40 + random(`sx${i}`) * (W - 80)} y={30 + random(`sy${i}`) * 230} r={i < 4 ? 24 : 7 + random(`sr${i}`) * 7}
            opacity={Math.min(1, Math.max(0, night - 0.5) * 2.2) * (0.7 + 0.3 * Math.sin(time * 2 + i))} />
        ))}
        <Sun x={1080} y={sunY} time={time} opacity={1 - night * 1.6} />
        <Moon x={1060} y={moonY} time={time} opacity={(night - 0.4) * 2.5} />
        {[0, 1, 2, 3].map((i) => (
          <Cloud key={i} x={((i * 400 + time * (12 + i * 5) * (1 + wind * 4)) % (W + 400)) - 200} y={70 + (i % 3) * 55} s={1 - (i % 2) * 0.3}
            opacity={0.95 - night * 0.55} tint={interpolateColors(Math.max(rain, night * 0.6), [0, 1], ["#ffffff", "#9aa6c2"])} />
        ))}
        <path d={`M0 ${GROUND - 120} C 220 ${GROUND - 200} 420 ${GROUND - 90} 640 ${GROUND - 140} S 1060 ${GROUND - 210} ${W} ${GROUND - 130} V ${GROUND} H 0 Z`} fill={sky("#a8d98a", "#c7b47a", "#2c4436")} />
        <path d={`M0 ${GROUND - 60} C 260 ${GROUND - 120} 520 ${GROUND - 40} 780 ${GROUND - 80} S 1120 ${GROUND - 110} ${W} ${GROUND - 70} V ${GROUND} H 0 Z`} fill={sky("#7fc46a", "#a8a861", "#24392b")} />
        <rect y={GROUND} width={W} height={H - GROUND} fill={sky("#6cb85a", "#8fa257", "#1f3324")} />
        {/* a little path of flowers in the grass */}
        {Array.from({ length: 26 }).map((_, i) => (
          <circle key={i} cx={random(`gx${i}`) * W} cy={GROUND + 10 + random(`gy${i}`) * 150} r={4 + random(`gr${i}`) * 3}
            fill={["#ffd23f", "#ff8fab", "#ffffff"][i % 3]} opacity={0.85 - night * 0.5} />
        ))}
      </svg>

      {/* a kite bobs in the sky, higher when the wind blows */}
      <Piece id="kite" x={230 + Math.sin(time * 0.6) * 40} bottom={250 - wind * 60 + Math.sin(time * 1.1) * 18} w={78 + wind * 10}
        opacity={1 - night * 1.3} transform={`rotate(${Math.sin(time * 1.7) * (10 + wind * 15)}deg)`} />

      {/* village behind the tree */}
      <Piece id="temple" x={150} bottom={GROUND - 30} w={190} filter={dim} />
      <Piece id="hut" x={1120} bottom={GROUND - 15} w={250} filter={dim} transform={level("knock") ? `translateX(${Math.sin(time * 50) * 4}px)` : ""} />
      <Piece id="mango_tree" x={975} bottom={GROUND - 25} w={200} filter={dim} transform={`rotate(${sway(2, 0.8)}deg)`} />

      {/* the banyan, swaying gently */}
      <Piece id="banyan" x={640} bottom={GROUND + 30} w={740} filter={dim} transform={`rotate(${sway(0, 0.35)}deg) skewX(${sway(1, 0.4)}deg)`} />
      <Piece id="parrot" x={810} bottom={300 + Math.sin(time * 2) * 3} w={68} filter={dim} transform={`rotate(${Math.sin(time * 3) * 6}deg)`} />
      <Piece id="cow" x={1185} bottom={GROUND + 55} w={170} filter={dim} transform={`scaleY(${1 + Math.sin(time * 1.2) * 0.015})`} />

      {/* a peacock strolls across now and then */}
      {(() => {
        const cycle = 40, t = (time + 6) % cycle;
        if (t > 14) return null;
        return <Piece id="peacock" x={-120 + t * 110} bottom={GROUND + 40} w={150} filter={dim} transform={`translateY(${-Math.abs(Math.sin(t * 5)) * 6}px)`} />;
      })()}
      {[0, 1, 2].map((i) => (
        <Piece key={i} id="butterfly" x={240 + i * 400 + Math.sin(time * 0.7 + i * 3) * 150} bottom={330 + Math.sin(time * 1.3 + i) * 70} w={46}
          opacity={1 - night * 1.4} transform={`rotate(${Math.sin(time * 2 + i) * 15}deg) scaleX(${0.4 + Math.abs(Math.sin(time * 10 + i)) * 0.6})`} />
      ))}

      {/* warm glow around the storytellers as it gets dark */}
      <div style={{ position: "absolute", left: 140, top: 250, width: 1000, height: 380, borderRadius: "50%",
        background: "radial-gradient(closest-side, rgba(255,214,120,0.55), rgba(255,214,120,0))", opacity: night * (0.85 + 0.15 * Math.sin(time * 9)) }} />
      {/* a soft spotlight under whoever is speaking */}
      {(["AJJA", "KID"] as const).map((who) => (
        <div key={who} style={{ position: "absolute", left: (who === "AJJA" ? 370 : 900) - 170, top: 330, width: 340, height: 340, borderRadius: "50%", zIndex: 1,
          background: "radial-gradient(closest-side, rgba(255,240,170,0.75), rgba(255,240,170,0))", opacity: halo(who) }} />
      ))}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, zIndex: 3 }}>
        <defs><radialGradient id="halo-diya"><stop offset="0" stopColor="#fff3b0" stopOpacity="0.8" /><stop offset="1" stopColor="#fff3b0" stopOpacity="0" /></radialGradient></defs>
        <Diya x={590} y={GROUND + 52} time={time} glow={night} />
        <Diya x={690} y={GROUND + 52} time={time + 0.4} glow={night} />
      </svg>

      {/* the storytellers */}
      <Piece id="ajja" x={370} bottom={GROUND + 95 + bob("AJJA")} w={290} z={2}
        transform={`scale(${breathe(0) + (speaker === "AJJA" ? 0.03 : 0)}) rotate(${lean("AJJA", 1) + nod("AJJA")}deg)`} />
      <Piece id="kid" x={900} bottom={GROUND + 100 + bob("KID") - cheer} w={250} z={2}
        transform={`scale(${breathe(1.3) + (speaker === "KID" ? 0.03 : 0)}) rotate(${lean("KID", -1) + nod("KID")}deg)`} />
      <Piece id="puppy" x={1075} bottom={GROUND + 98} w={110} z={2} transform={`rotate(${Math.sin(time * 6) * 4}deg)`} />
      <Piece id="marigolds" x={60} bottom={H + 6} w={230} z={3} transform={`rotate(${sway(3, 0.6)}deg)`} />
      <Piece id="marigolds" x={1230} bottom={H + 6} w={210} z={3} transform={`scaleX(-1) rotate(${sway(4, 0.6)}deg)`} />

      {/* sound-effect visuals */}
      <Fx level={level} cueStart={cueStart} time={time} />
    </div>
  );
}

function Fx({ level, cueStart, time }: { level: Level; cueStart: (id: SfxId) => number; time: number }) {
  const birds = level("birds"), rain = level("rain"), bell = level("bell"), drum = level("drum"), flute = level("flute");
  const chime = level("chime"), splash = Math.max(level("splash"), level("river")), wind = level("wind");
  const crickets = level("crickets"), steps = level("footsteps");
  return (
    <>
      {birds > 0 && [0, 1, 2, 3].map((i) => (
        <Piece key={i} id="bird" x={-80 + (time - cueStart("birds")) * (240 + i * 40) + i * 90} bottom={200 + i * 40 + Math.sin(time * 4 + i) * 12} w={70 - i * 6}
          opacity={birds} transform={`scaleY(${0.75 + Math.abs(Math.sin(time * 12 + i)) * 0.35})`} z={4} />
      ))}
      {rain > 0 && <>
        {[0, 1, 2].map((i) => <Piece key={i} id="rain_cloud" x={260 + i * 380 + Math.sin(time * 0.5 + i) * 20} bottom={260 + (i % 2) * 30} w={280} opacity={rain} z={4} />)}
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: rain * 0.8, zIndex: 4 }}>
          {Array.from({ length: 80 }).map((_, i) => {
            const x = (random(`rx${i}`) * W + time * 40) % W, y = (random(`ry${i}`) * H + time * 650) % H;
            return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 20} stroke="#cfe6ff" strokeWidth={3} strokeLinecap="round" />;
          })}
        </svg>
      </>}
      {bell > 0 && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: bell, zIndex: 4 }}>
        <Bell x={150} y={330} swing={Math.sin(time * 9) * 25} />
        {[0, 1, 2].map((i) => <circle key={i} cx={150} cy={370} r={40 + ((time * 80 + i * 30) % 90)} fill="none" stroke="#ffe066" strokeWidth={4}
          opacity={1 - ((time * 80 + i * 30) % 90) / 90} />)}
      </svg>}
      {drum > 0 && <Piece id="dholak" x={640} bottom={GROUND + 60} w={170} opacity={drum} z={4} transform={`scale(${1 + Math.abs(Math.sin(time * 8)) * 0.1})`} />}
      {flute > 0 && <>
        <Piece id="flute" x={520} bottom={300} w={210} opacity={flute} z={4} transform={`rotate(${Math.sin(time * 2) * 5}deg)`} />
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: flute, zIndex: 4 }}>
          {[0, 1, 2, 3].map((i) => {
            const t = (time * 0.6 + i / 4) % 1;
            return <text key={i} x={560 + t * 160 + Math.sin(t * 9 + i) * 20} y={300 - t * 140} fontSize={34} fill="#7a3fa0" opacity={1 - t}>{i % 2 ? "♪" : "♫"}</text>;
          })}
        </svg>
      </>}
      {splash > 0 && <Piece id="splash" x={640} bottom={GROUND + 100} w={220} opacity={splash} z={4}
        transform={`scale(${0.6 + Math.min(1, (time - cueStart(level("splash") ? "splash" : "river")) * 2) * 0.5})`} />}
      {(chime > 0 || crickets > 0) && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, zIndex: 4 }}>
        {chime > 0 && Array.from({ length: 10 }).map((_, i) => {
          const a = (i / 10) * Math.PI * 2 + time * 1.5, r = 200 + Math.sin(time * 3 + i) * 40;
          return <Star key={i} i={i} time={time} x={640 + Math.cos(a) * r * 1.7} y={330 + Math.sin(a) * r * 0.8} r={20} opacity={chime} />;
        })}
        {/* fireflies with the crickets */}
        {crickets > 0 && Array.from({ length: 18 }).map((_, i) => (
          <circle key={i} cx={120 + random(`fx${i}`) * 1040 + Math.sin(time * 0.5 + i) * 40} cy={260 + random(`fy${i}`) * 260 + Math.cos(time * 0.7 + i * 2) * 25}
            r={5} fill="#fff27a" opacity={crickets * (Math.sin(time * 3 + i * 1.3) + 1) / 2} />
        ))}
      </svg>}
      {steps > 0 && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: steps, zIndex: 4 }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const shown = (time - cueStart("footsteps")) * 3 > i;
          return shown ? <ellipse key={i} cx={460 + i * 70} cy={GROUND + 150 + (i % 2) * 20} rx={14} ry={20} fill={INK} opacity={0.35} /> : null;
        })}
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
