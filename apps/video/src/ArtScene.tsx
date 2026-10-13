import type { SfxId } from "@banyan/core";
import { Img, interpolate, interpolateColors, random } from "remotion";
import { ART } from "./art.ts";

/**
 * The storybook scene built from Inspyry vector art: sky and hills are drawn in code (smooth
 * gradients Inspyry can't make), every object is a generated SVG placed and animated here.
 */
const W = 1280;
const H = 720;
const GROUND = 540;

type Level = (id: SfxId) => number;

/** An art piece anchored at its bottom-centre (x, bottom), `w` px wide; transforms pivot at the base. */
function Piece({ id, x, bottom, w, transform = "", opacity = 1, filter, z }: {
  id: string; x: number; bottom: number; w: number; transform?: string; opacity?: number; filter?: string; z?: number;
}) {
  const src = ART[id];
  if (!src || opacity <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x - w / 2, bottom: H - bottom, width: w, transformOrigin: "50% 100%", transform, opacity, filter, zIndex: z }}>
      <Img src={src} style={{ width: "100%", display: "block" }} />
    </div>
  );
}

export function ArtScene({ time, progress, speaker, open, excited, level, cueStart }: {
  time: number; progress: number; speaker: "AJJA" | "KID" | null; open: number; excited: boolean; level: Level; cueStart: (id: SfxId) => number;
}) {
  const rain = level("rain");
  const wind = level("wind");
  const night = Math.min(1, progress * 1.1 + rain * 0.25);
  const skyTop = interpolateColors(night, [0, 0.45, 1], ["#7ec8f0", "#f59e6b", "#1c2650"]);
  const skyBottom = interpolateColors(night, [0, 0.45, 1], ["#d7f0ff", "#ffd59e", "#3d4f8a"]);
  const shade = (day: string, dusk: string, dark: string) => interpolateColors(night, [0, 0.45, 1], [day, dusk, dark]);
  // scenery dims a little at night; characters stay bright (they're lit by the diyas)
  const dim = `brightness(${interpolate(night, [0, 1], [1, 0.62])}) saturate(${interpolate(night, [0, 1], [1, 0.8])})`;
  const sway = (i: number, amp: number) => Math.sin(time * 0.8 + i) * amp * (1 + wind * 3);

  const talkAjja = speaker === "AJJA" && open > 0.3 && ART.ajja_talk;
  const talkKid = speaker === "KID" && open > 0.3 && ART.kid_talk;
  const kidId = speaker === "KID" && excited && ART.kid_cheer ? "kid_cheer" : talkKid ? "kid_talk" : "kid";
  const breathe = (o: number) => 1 + Math.sin(time * 1.6 + o) * 0.012;
  const bob = (who: "AJJA" | "KID") => (speaker === who ? -Math.abs(Math.sin(time * 7)) * 6 - open * 6 : 0);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* sky, sun/moon, stars, clouds */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${skyTop}, ${skyBottom})` }} />
      {ART.star && Array.from({ length: 14 }).map((_, i) => (
        <Img key={i} src={ART.star} style={{ position: "absolute", width: 18 + random(`ss${i}`) * 16, left: random(`sx${i}`) * W, top: 20 + random(`sy${i}`) * 230,
          opacity: Math.max(0, night - 0.45) * 1.8 * (0.6 + 0.4 * Math.sin(time * 2 + i)), transform: `rotate(${Math.sin(time + i) * 12}deg)` }} />
      ))}
      <Piece id="sun" x={1080} bottom={interpolate(progress, [0, 0.5], [470, 190], { extrapolateRight: "clamp" })} w={130} opacity={1 - night * 1.4} transform={`rotate(${time * 6}deg)`} />
      <Piece id="moon" x={1060} bottom={interpolate(progress, [0.3, 1], [470, 210], { extrapolateLeft: "clamp" })} w={120} opacity={(night - 0.35) * 2} transform={`rotate(${Math.sin(time * 0.5) * 6}deg)`} />
      {[0, 1, 2].map((i) => (
        <Piece key={i} id="cloud" x={((i * 520 + time * (10 + i * 4) * (1 + wind * 4)) % (W + 400)) - 200} bottom={180 + i * 45} w={200 - i * 30} opacity={0.9 - night * 0.5} />
      ))}

      {/* rolling hills, drawn for smooth colour */}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <path d={`M0 ${GROUND - 120} C 220 ${GROUND - 200} 420 ${GROUND - 90} 640 ${GROUND - 140} S 1060 ${GROUND - 210} ${W} ${GROUND - 130} V ${GROUND} H 0 Z`} fill={shade("#a8d98a", "#c7b47a", "#2c4436")} />
        <path d={`M0 ${GROUND - 60} C 260 ${GROUND - 120} 520 ${GROUND - 40} 780 ${GROUND - 80} S 1120 ${GROUND - 110} ${W} ${GROUND - 70} V ${GROUND} H 0 Z`} fill={shade("#7fc46a", "#a8a861", "#24392b")} />
        <rect y={GROUND} width={W} height={H - GROUND} fill={shade("#6cb85a", "#8fa257", "#1f3324")} />
        <ellipse cx={640} cy={GROUND + 40} rx={520} ry={40} fill="#000" opacity={0.08} />
      </svg>

      {/* village behind the tree */}
      <Piece id="temple" x={150} bottom={GROUND - 40} w={170} filter={dim} />
      <Piece id="hut" x={1110} bottom={GROUND - 20} w={240} filter={dim} transform={level("knock") ? `translateX(${Math.sin(time * 50) * 4}px)` : ""} />
      <Piece id="mango_tree" x={960} bottom={GROUND - 30} w={190} filter={dim} transform={`rotate(${sway(2, 0.8)}deg)`} />
      <Piece id="cow" x={1180} bottom={GROUND + 60} w={180} filter={dim} transform={`scaleY(${1 + Math.sin(time * 1.2) * 0.015})`} />

      {/* the banyan, swaying gently */}
      <Piece id="banyan" x={640} bottom={GROUND + 25} w={860} filter={dim} transform={`rotate(${sway(0, 0.35)}deg) skewX(${sway(1, 0.4)}deg)`} />
      <Piece id="parrot" x={830} bottom={250 + Math.sin(time * 2) * 3} w={70} filter={dim} transform={`rotate(${Math.sin(time * 3) * 6}deg)`} />

      {/* a peacock strolls across now and then */}
      {(() => {
        const cycle = 45, t = time % cycle;
        if (t > 14) return null;
        return <Piece id="peacock" x={-120 + t * 110} bottom={GROUND + 70} w={150} filter={dim} transform={`translateY(${-Math.abs(Math.sin(t * 5)) * 6}px)`} />;
      })()}
      {[0, 1].map((i) => (
        <Piece key={i} id="butterfly" x={300 + i * 600 + Math.sin(time * 0.7 + i * 3) * 160} bottom={330 + Math.sin(time * 1.3 + i) * 70} w={50}
          opacity={1 - night} transform={`scaleX(${0.4 + Math.abs(Math.sin(time * 10 + i)) * 0.6})`} />
      ))}

      {/* warm glow around the storytellers as it gets dark, and diyas */}
      <div style={{ position: "absolute", left: 140, top: 250, width: 1000, height: 380, borderRadius: "50%",
        background: "radial-gradient(closest-side, rgba(255,214,120,0.55), rgba(255,214,120,0))", opacity: night * (0.85 + 0.15 * Math.sin(time * 9)) }} />
      <Piece id="diya" x={530} bottom={GROUND + 58} w={56} />
      <Piece id="diya" x={750} bottom={GROUND + 58} w={56} />

      {/* storytellers: pose swap while talking, bob, breathe; listener nods */}
      <Piece id={talkAjja ? "ajja_talk" : "ajja"} x={360} bottom={GROUND + 62 + bob("AJJA")} w={300} z={2}
        transform={`scale(${breathe(0)}) rotate(${speaker === "KID" ? Math.sin(time * 1.8) * 1.5 : 0}deg)`} />
      <Piece id={kidId} x={915} bottom={GROUND + 66 + bob("KID") - (kidId === "kid_cheer" ? Math.abs(Math.sin(time * 9)) * 18 : 0)} w={235} z={2}
        transform={`scale(${breathe(1.3)}) rotate(${speaker === "AJJA" ? Math.sin(time * 1.6 + 1) * 2 : 0}deg)`} />
      <Piece id="puppy" x={1075} bottom={GROUND + 70} w={105} z={2} transform={`rotate(${Math.sin(time * 6) * 4}deg)`} />
      <Piece id="marigolds" x={70} bottom={H + 6} w={240} z={3} transform={`rotate(${sway(3, 0.6)}deg)`} />
      <Piece id="marigolds" x={1230} bottom={H + 6} w={220} z={3} transform={`scaleX(-1) rotate(${sway(4, 0.6)}deg)`} />

      {/* sound-effect visuals */}
      <Fx level={level} cueStart={cueStart} time={time} />
    </div>
  );
}

function Fx({ level, cueStart, time }: { level: Level; cueStart: (id: SfxId) => number; time: number }) {
  const birds = level("birds"), rain = level("rain"), bell = level("bell"), drum = level("drum"), flute = level("flute");
  const chime = level("chime"), splash = Math.max(level("splash"), level("river")), wind = level("wind");
  return (
    <>
      {birds > 0 && [0, 1, 2, 3].map((i) => (
        <Piece key={i} id="bird" x={-80 + (time - cueStart("birds")) * (240 + i * 40) + i * 90} bottom={560 - i * 40 + Math.sin(time * 4 + i) * 12} w={70 - i * 6}
          opacity={birds} transform={`scaleY(${0.75 + Math.abs(Math.sin(time * 12 + i)) * 0.35})`} z={4} />
      ))}
      {rain > 0 && <>
        {[0, 1, 2].map((i) => <Piece key={i} id="rain_cloud" x={260 + i * 380} bottom={330 + (i % 2) * 30} w={300} opacity={rain} z={4} />)}
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: rain * 0.8, zIndex: 4 }}>
          {Array.from({ length: 80 }).map((_, i) => {
            const x = (random(`rx${i}`) * W + time * 40) % W, y = (random(`ry${i}`) * H + time * 650) % H;
            return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 20} stroke="#cfe6ff" strokeWidth={3} strokeLinecap="round" />;
          })}
        </svg>
      </>}
      {bell > 0 && <Piece id="bell" x={150} bottom={GROUND - 120} w={70} opacity={bell} z={4} transform={`rotate(${Math.sin(time * 9) * 25}deg)`} />}
      {drum > 0 && <Piece id="dholak" x={640} bottom={GROUND + 120} w={170} opacity={drum} z={4} transform={`scale(${1 + Math.abs(Math.sin(time * 8)) * 0.1})`} />}
      {flute > 0 && <Piece id="flute" x={470} bottom={GROUND - 120} w={200} opacity={flute} z={4} transform={`rotate(${-20 + Math.sin(time * 2) * 5}deg)`} />}
      {splash > 0 && <Piece id="splash" x={640} bottom={GROUND + 140} w={220} opacity={splash} z={4} transform={`scale(${0.6 + Math.min(1, (time - cueStart(level("splash") ? "splash" : "river")) * 2) * 0.5})`} />}
      {chime > 0 && ART.star && Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2 + time * 1.5, r = 220 + Math.sin(time * 3 + i) * 40;
        return <Img key={i} src={ART.star} style={{ position: "absolute", zIndex: 4, width: 40, left: 640 + Math.cos(a) * r * 1.7 - 20, top: 330 + Math.sin(a) * r * 0.8 - 20, opacity: chime, transform: `rotate(${time * 90}deg)` }} />;
      })}
      {wind > 0 && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0, opacity: wind, zIndex: 4 }}>
        {Array.from({ length: 14 }).map((_, i) => {
          const x = ((random(`lx${i}`) * W) + time * 330) % (W + 80) - 40, y = 160 + random(`ly${i}`) * 360 + Math.sin(time * 3 + i) * 30;
          return <ellipse key={i} cx={x} cy={y} rx={11} ry={5} fill="#6cbf4a" transform={`rotate(${time * 200 + i * 40} ${x} ${y})`} />;
        })}
      </svg>}
    </>
  );
}
