import { planShots, type PreparedClip, type SfxId } from "@banyan/core";
import { useMemo } from "react";
// @remotion/media's Audio: the browser renderer rejects remotion's Html5Audio ("<Html5Audio> is not supported")
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, interpolateColors, random, spring, useCurrentFrame } from "remotion";
import { ArtScene } from "./ArtScene.tsx";
import { ART, hasStorybookArt } from "./art.ts";
import { FPS } from "./audio.ts";

export type VideoCue = { id: SfxId; at: number; url: string; seconds: number };

// a type alias (not an interface) so Remotion accepts it as Record<string, unknown> props
export type BanyanVideoProps = {
  title: string;
  episodeTitle?: string;
  chapterNo?: number;
  themeColor: string;
  moral: string;
  clips: PreparedClip[];
  duration: number;
  mouth: number[];
  cues?: VideoCue[];
  ambienceUrl?: string | null;
  ambienceSeconds?: number;
};

/** The comic "sound word" shown with each effect, so kids can read along with the sound. */
const SOUND_WORD: Record<SfxId, string> = {
  birds: "Tweet tweet!", wind: "Whoosh!", rain: "Pitter patter", river: "Gurgle gurgle", bell: "Ding dong!",
  crickets: "Chirp chirp", footsteps: "Tap tap tap", drum: "Dhin dhin!", flute: "La la la", chime: "Twinkle!",
  splash: "Splish splash!", knock: "Knock knock!",
};

const W = 1280;
const H = 720;
const GROUND = 520;

const clipAt = (clips: PreparedClip[], time: number) => clips.find((c) => time >= c.start && time < c.end) ?? null;
/** 0..1 envelope for an effect: quick rise, hold, gentle fall. */
const cueLevel = (time: number, at: number, len: number) =>
  time < at || time > at + len ? 0 : Math.min(1, (time - at) / 0.25, (at + len - time) / 0.6);

export function BanyanVideo(props: BanyanVideoProps) {
  const frame = useCurrentFrame();
  const time = frame / FPS;
  const clip = clipAt(props.clips, time);
  const progress = Math.min(1, time / Math.max(1, props.duration));
  const cues = props.cues ?? [];
  const active = cues.map((c) => ({ ...c, level: cueLevel(time, c.at, Math.max(2.2, c.seconds)) })).filter((c) => c.level > 0);
  const level = (id: SfxId) => active.filter((c) => c.id === id).reduce((m, c) => Math.max(m, c.level), 0);
  const open = clip ? (props.mouth[Math.min(frame, props.mouth.length - 1)] ?? 0) : 0;
  const showMoral = time > props.duration - 8 && props.duration > 20;
  const rain = level("rain");
  const wind = level("wind");

  // evening -> night over the chapter, a little darker while it rains
  const night = Math.min(1, progress * 1.15 + rain * 0.25);
  const skyTop = interpolateColors(night, [0, 0.5, 1], ["#f4a65f", "#7b5ea7", "#18223f"]);
  const skyBottom = interpolateColors(night, [0, 0.5, 1], ["#fbe0a6", "#e7a98a", "#3a4a78"]);
  const groundCol = interpolateColors(night, [0, 1], ["#7fae5a", "#2f4a33"]);
  const sway = (i: number, amp = 1) => Math.sin(time * 0.9 + i * 1.7) * (3 + wind * 14) * amp;

  const storybook = hasStorybookArt();
  const shots = useMemo(() => (storybook ? planShots(props.clips, cues, props.duration) : []), [storybook, props.clips, cues, props.duration]);
  const cueStart = (id: SfxId) => active.find((c) => c.id === id)?.at ?? 0;

  return (
    <AbsoluteFill style={{ background: skyBottom, fontFamily: "'Baloo 2', 'Comic Sans MS', 'Trebuchet MS', sans-serif", overflow: "hidden" }}>
      {storybook && (
        <ArtScene time={time} progress={progress} clips={props.clips} shots={shots} speaker={clip?.speaker ?? null} open={open}
          excited={clip?.speaker === "KID" && /[?!]\s*$/.test(clip.text)} level={level} cueStart={cueStart} />
      )}
      {/* fallback scene drawn in code, used until the Inspyry art exists (see art/manifest.json) */}
      {!storybook && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="1" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id="glow"><stop offset="0" stopColor="#fff6c8" stopOpacity="0.9" /><stop offset="1" stopColor="#fff6c8" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#sky)" />

        {/* stars come out as night falls */}
        {Array.from({ length: 40 }).map((_, i) => (
          <circle key={i} cx={random(`sx${i}`) * W} cy={random(`sy${i}`) * 300} r={1 + random(`sr${i}`) * 1.8}
            fill="#fffbe6" opacity={Math.max(0, night - 0.35) * (0.55 + 0.45 * Math.sin(time * 2 + i))} />
        ))}
        {/* moon rises */}
        <circle cx={1060} cy={interpolate(progress, [0, 1], [300, 95])} r={46} fill="#fff4cf" opacity={0.35 + night * 0.65} />
        <circle cx={1060} cy={interpolate(progress, [0, 1], [300, 95])} r={110} fill="url(#glow)" opacity={night * 0.5} />

        {/* far hills and a little temple (its bell rings on cue) */}
        <path d={`M0 ${GROUND - 70} Q 200 ${GROUND - 150} 420 ${GROUND - 80} T 860 ${GROUND - 90} T 1280 ${GROUND - 110} V ${GROUND} H 0 Z`} fill={interpolateColors(night, [0, 1], ["#9cc07a", "#24392b"])} />
        <Temple x={1080} y={GROUND - 95} ring={level("bell")} time={time} night={night} />

        {/* ground */}
        <rect x={0} y={GROUND} width={W} height={H - GROUND} fill={groundCol} />
        <River level={level("river") || level("splash")} time={time} />

        {/* the banyan */}
        <g>
          <path d={`M 590 ${GROUND + 10} Q 600 360 560 250 L 700 250 Q 660 360 690 ${GROUND + 10} Z`} fill="#6b4a2f" />
          {Array.from({ length: 9 }).map((_, i) => {
            const x = 380 + i * 62;
            return <path key={i} d={`M ${x} 230 Q ${x + sway(i, 0.6)} 330 ${x + sway(i + 3, 0.9)} ${410 + (i % 3) * 30}`} stroke="#7a5a3a" strokeWidth={5} fill="none" opacity={0.9} />;
          })}
          {[[640, 170, 330, 120], [430, 210, 170, 90], [850, 205, 180, 95], [560, 120, 170, 80], [740, 115, 180, 85]].map(([cx, cy, rx, ry], i) => (
            <ellipse key={i} cx={cx + sway(i, 0.5)} cy={cy + Math.cos(time + i) * 2} rx={rx} ry={ry}
              fill={interpolateColors(night, [0, 1], [["#2f7a3e", "#3a8a48", "#2a6d37", "#46985a", "#357f43"][i], "#16331f"])} />
          ))}
        </g>

        {/* fireflies, brighter at night */}
        {Array.from({ length: 16 }).map((_, i) => {
          const x = 120 + random(`fx${i}`) * 1040 + Math.sin(time * 0.5 + i) * 40;
          const y = 200 + random(`fy${i}`) * 300 + Math.cos(time * 0.7 + i * 2) * 25;
          const blink = (Math.sin(time * 3 + i * 1.3) + 1) / 2;
          return <circle key={i} cx={x} cy={y} r={3.5} fill="#fff27a" opacity={(0.15 + night * 0.85) * blink} />;
        })}

        <Grass time={time} wind={wind} night={night} />
        <Footprints level={level("footsteps")} />
        <Birds level={level("birds")} time={time} start={active.find((c) => c.id === "birds")?.at ?? 0} />

        {/* the storytellers */}
        <Ajja x={360} y={GROUND - 10} time={time} open={clip?.speaker === "AJJA" ? open : 0} speaking={clip?.speaker === "AJJA"} />
        <Kid x={900} y={GROUND + 20} time={time} open={clip?.speaker === "KID" ? open : 0} speaking={clip?.speaker === "KID"}
          excited={clip?.speaker === "KID" && /[?!]\s*$/.test(clip.text)} />

        <Notes level={level("flute")} time={time} />
        <Drum level={level("drum")} time={time} />
        <Sparkles level={Math.max(level("chime"), level("crickets") * 0.4)} time={time} />
        <Leaves level={wind} time={time} />
        <Rain level={rain} time={time} />
        <Door level={level("knock")} time={time} />
      </svg>}

      {/* sound words, comic style */}
      {active.map((c, i) => (
        <div key={`${c.id}${c.at}`} style={{
          position: "absolute", left: 80 + ((i * 370 + Math.round(c.at * 53)) % 820), top: 70 + (i % 2) * 70,
          transform: `scale(${0.6 + 0.4 * spring({ frame: frame - Math.round(c.at * FPS), fps: FPS, config: { damping: 9 } })}) rotate(${-6 + (i % 3) * 5}deg)`,
          opacity: c.level, background: "#fff7d6", border: "5px solid #3b2a17", borderRadius: 26, padding: "6px 22px",
          fontSize: 46, fontWeight: 800, color: "#c2410c", boxShadow: "6px 6px 0 #3b2a17",
        }}>{SOUND_WORD[c.id]}</div>
      ))}

      {/* caption bubble: big, short, the spoken word lit up */}
      {!showMoral && clip && (
        <div style={{ position: "absolute", left: 120, right: 120, bottom: 26, display: "flex", justifyContent: "center" }}>
          <div style={{
            background: "rgba(255,251,240,0.95)", border: `5px solid ${clip.speaker === "KID" ? "#2563a8" : "#8a5a2b"}`, borderRadius: 28,
            padding: "10px 26px 14px", fontSize: 44, lineHeight: 1.3, color: "#2c2318", textAlign: "center", maxWidth: 1040,
          }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: clip.speaker === "KID" ? "#2563a8" : "#8a5a2b", marginRight: 12 }}>{clip.speaker === "KID" ? "Kid" : "Ajja"}</span>
            {clip.words.map((w, i) => {
              const lit = time >= w.start && time < w.end;
              return <span key={i} style={{ background: lit ? "#f2c14e" : "transparent", borderRadius: 10, padding: "0 4px", fontWeight: lit ? 800 : 500 }}>{w.text} </span>;
            })}
          </div>
        </div>
      )}

      {/* storybook iris: opens on the scene, closes at the very end */}
      {storybook && <Iris r={interpolate(time, [0.3, 1.5], [0, 760], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.5, 0, 0.2, 1) })} />}

      {/* opening title card */}
      {time < 3.2 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: interpolate(time, [0, 0.4, 2.6, 3.2], [0, 1, 1, 0]) }}>
          <div style={{ background: "#fff7d6", border: "6px solid #3b2a17", borderRadius: 36, padding: "24px 56px", textAlign: "center", boxShadow: "10px 10px 0 #3b2a17",
            transform: `scale(${spring({ frame, fps: FPS, config: { damping: 11 } })})` }}>
            {ART.logo && <Img src={ART.logo} style={{ width: 420, display: "block", margin: "0 auto 8px" }} />}
            <div style={{ fontSize: 34, color: "#8a5a2b", fontWeight: 700 }}>{props.episodeTitle ?? "Banyan and Beyond"}</div>
            <div style={{ fontSize: 76, color: "#2f6b3a", fontWeight: 800 }}>{props.chapterNo ? `Chapter ${props.chapterNo}` : props.title}</div>
          </div>
        </div>
      )}

      {/* moral card */}
      {showMoral && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <div style={{ background: "#fff7d6", border: "6px solid #3b2a17", borderRadius: 36, padding: "28px 48px", maxWidth: 980, textAlign: "center", boxShadow: "10px 10px 0 #3b2a17",
            transform: `scale(${spring({ frame: frame - Math.round((props.duration - 8) * FPS), fps: FPS, config: { damping: 10 } })})` }}>
            <div style={{ fontSize: 36, color: "#c2410c", fontWeight: 800 }}>★ Today's lesson ★</div>
            <div style={{ fontSize: 52, color: "#2c2318", fontWeight: 700, lineHeight: 1.25 }}>{props.moral}</div>
          </div>
        </div>
      )}

      {storybook && props.duration > 20 && time > props.duration - 1.4 && (
        <Iris r={interpolate(time, [props.duration - 1.4, props.duration - 0.2], [760, 0], { extrapolateRight: "clamp", easing: Easing.bezier(0.6, 0, 0.8, 1) })} />
      )}

      {/* progress: a little vine with a leaf */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "rgba(0,0,0,0.15)" }}>
        <div style={{ width: `${progress * 100}%`, height: 10, background: "#4caf50" }} />
      </div>

      {/* audio: voices, effects, and a soft looping evening bed */}
      {props.clips.map((c) => (
        <Sequence key={c.index} from={Math.round(c.start * FPS)} durationInFrames={Math.max(1, Math.round((c.end - c.start) * FPS))}>
          <Audio src={c.url} />
        </Sequence>
      ))}
      {cues.map((c, i) => (
        <Sequence key={`sfx${i}`} from={Math.round(c.at * FPS)} durationInFrames={Math.max(1, Math.round(c.seconds * FPS))}>
          <Audio src={c.url} volume={0.7} />
        </Sequence>
      ))}
      {props.ambienceUrl && Array.from({ length: Math.ceil(props.duration / (props.ambienceSeconds ?? 16)) }).map((_, i) => (
        <Sequence key={`amb${i}`} from={Math.round(i * (props.ambienceSeconds ?? 16) * FPS)} durationInFrames={Math.round((props.ambienceSeconds ?? 16) * FPS)}>
          <Audio src={props.ambienceUrl!} volume={0.22} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/* ---------- characters ---------- */

function Eyes({ cx, cy, gap, blink }: { cx: number; cy: number; gap: number; blink: boolean }) {
  return (
    <>
      {[-1, 1].map((s) => blink
        ? <path key={s} d={`M ${cx + s * gap - 8} ${cy} q 8 5 16 0`} stroke="#2a1a0e" strokeWidth={4} fill="none" strokeLinecap="round" />
        : <g key={s}><ellipse cx={cx + s * gap} cy={cy} rx={7} ry={9} fill="#2a1a0e" /><circle cx={cx + s * gap + 2} cy={cy - 3} r={2.4} fill="#fff" /></g>)}
    </>
  );
}

const blinking = (time: number, offset: number) => (time + offset) % 4.1 < 0.14;

function Ajja({ x, y, time, open, speaking }: { x: number; y: number; time: number; open: number; speaking: boolean }) {
  const bob = speaking ? Math.sin(time * 6) * 2 + open * 4 : Math.sin(time * 1.2) * 1.5;
  const nod = !speaking ? Math.max(0, Math.sin(time * 1.6)) * 4 : open * 3;
  const arm = speaking ? -20 - Math.sin(time * 3.2) * 18 : 0;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* stone seat */}
      <ellipse cx={0} cy={18} rx={120} ry={26} fill="#8d8478" />
      {/* body: kurta + shawl */}
      <path d="M -80 10 Q -85 -110 0 -125 Q 85 -110 80 10 Z" fill="#f7f2e6" stroke="#3b2a17" strokeWidth={5} />
      <path d="M -78 -40 Q 0 -10 78 -40 L 70 -95 Q 0 -70 -70 -95 Z" fill="#a0522d" opacity={0.9} />
      {/* walking stick + gesturing arm */}
      <line x1={110} y1={20} x2={95} y2={-150} stroke="#6b4a2f" strokeWidth={8} strokeLinecap="round" />
      <g transform={`rotate(${arm} -60 -90)`}>
        <path d="M -60 -90 Q -120 -60 -110 -10" stroke="#f7f2e6" strokeWidth={26} fill="none" strokeLinecap="round" />
        <circle cx={-110} cy={-10} r={14} fill="#c98b5a" stroke="#3b2a17" strokeWidth={4} />
      </g>
      {/* head */}
      <g transform={`translate(0 ${-185 - bob}) rotate(${nod * 0.6})`}>
        <circle cx={0} cy={0} r={62} fill="#c98b5a" stroke="#3b2a17" strokeWidth={5} />
        <path d="M -60 -5 Q -66 -50 -40 -45 M 60 -5 Q 66 -50 40 -45" stroke="#f1f1f1" strokeWidth={14} fill="none" strokeLinecap="round" />
        <Eyes cx={0} cy={-8} gap={22} blink={blinking(time, 0)} />
        {/* round glasses */}
        <circle cx={-22} cy={-8} r={16} fill="none" stroke="#3b2a17" strokeWidth={3} />
        <circle cx={22} cy={-8} r={16} fill="none" stroke="#3b2a17" strokeWidth={3} />
        <line x1={-6} y1={-8} x2={6} y2={-8} stroke="#3b2a17" strokeWidth={3} />
        {/* white moustache + beard, mouth opens with the voice */}
        <path d={`M -38 30 Q 0 ${86 + open * 6} 38 30`} fill="#f4f4f4" opacity={0.95} />
        {/* mouth drawn over the beard so it reads clearly when he speaks */}
        <ellipse cx={0} cy={32 + open * 4} rx={12 + open * 3} ry={2.5 + open * 12} fill="#5a2317" />
        <path d="M -40 18 Q -20 8 0 20 Q 20 8 40 18 Q 20 30 0 24 Q -20 30 -40 18 Z" fill="#f4f4f4" stroke="#bbb" strokeWidth={2} />
      </g>
      <text x={0} y={60} textAnchor="middle" fontSize={30} fontWeight={800} fill="#fff7d6" stroke="#3b2a17" strokeWidth={1.5}>Ajja</text>
    </g>
  );
}

function Kid({ x, y, time, open, speaking, excited }: { x: number; y: number; time: number; open: number; speaking: boolean; excited: boolean }) {
  const bounce = excited ? Math.abs(Math.sin(time * 9)) * 16 : speaking ? Math.sin(time * 7) * 3 : Math.sin(time * 1.5 + 1) * 2;
  const tilt = speaking ? Math.sin(time * 2.5) * 4 : Math.sin(time * 0.8) * 3;
  return (
    <g transform={`translate(${x} ${y - bounce})`}>
      {/* legs crossed */}
      <ellipse cx={0} cy={8} rx={70} ry={20} fill="#3b6ea5" stroke="#3b2a17" strokeWidth={4} />
      {/* shirt */}
      <path d="M -50 0 Q -55 -80 0 -88 Q 55 -80 50 0 Z" fill="#f28c28" stroke="#3b2a17" strokeWidth={5} />
      {/* arms wave when excited */}
      {[-1, 1].map((s) => (
        <g key={s} transform={`rotate(${excited ? s * (-40 - Math.sin(time * 10) * 20) : s * -10} ${s * 40} -60)`}>
          <path d={`M ${s * 40} -60 Q ${s * 70} -30 ${s * 62} 0`} stroke="#f28c28" strokeWidth={18} fill="none" strokeLinecap="round" />
          <circle cx={s * 62} cy={0} r={11} fill="#d9a066" stroke="#3b2a17" strokeWidth={3} />
        </g>
      ))}
      {/* head */}
      <g transform={`translate(0 -130) rotate(${tilt})`}>
        <circle cx={0} cy={0} r={52} fill="#d9a066" stroke="#3b2a17" strokeWidth={5} />
        <path d="M -52 -8 Q -50 -60 0 -58 Q 50 -60 52 -8 Q 30 -36 0 -32 Q -30 -36 -52 -8 Z" fill="#1f1a17" />
        <path d="M 4 -56 Q 14 -82 26 -66" stroke="#1f1a17" strokeWidth={8} fill="none" strokeLinecap="round" />
        <Eyes cx={0} cy={0} gap={18} blink={blinking(time, 1.7)} />
        <circle cx={-30} cy={16} r={8} fill="#f08a7a" opacity={0.5} />
        <circle cx={30} cy={16} r={8} fill="#f08a7a" opacity={0.5} />
        {open > 0.05
          ? <ellipse cx={0} cy={24} rx={11} ry={3 + open * 11} fill="#5a2317" />
          : <path d="M -12 22 Q 0 32 12 22" stroke="#5a2317" strokeWidth={4} fill="none" strokeLinecap="round" />}
      </g>
      <text x={0} y={52} textAnchor="middle" fontSize={28} fontWeight={800} fill="#fff7d6" stroke="#3b2a17" strokeWidth={1.5}>Kid</text>
    </g>
  );
}

/* ---------- scenery and effect visuals ---------- */

function Grass({ time, wind, night }: { time: number; wind: number; night: number }) {
  return (
    <g>
      {Array.from({ length: 60 }).map((_, i) => {
        const x = i * 22 + 6;
        const lean = Math.sin(time * 1.4 + i * 0.7) * (3 + wind * 12);
        return <path key={i} d={`M ${x} ${H} q ${lean / 2} -18 ${lean} -${26 + (i % 4) * 6}`} stroke={interpolateColors(night, [0, 1], ["#4f8a3a", "#1f3a22"])} strokeWidth={4} fill="none" strokeLinecap="round" />;
      })}
    </g>
  );
}

function Birds({ level, time, start }: { level: number; time: number; start: number }) {
  if (!level) return null;
  return (
    <g opacity={level}>
      {[0, 1, 2, 3].map((i) => {
        const x = -60 + (time - start) * (260 + i * 30) + i * 70;
        const y = 120 + i * 28 + Math.sin(time * 3 + i) * 10;
        const flap = Math.sin(time * 14 + i) * 10;
        return <path key={i} d={`M ${x - 18} ${y - flap} Q ${x - 8} ${y - 8} ${x} ${y} Q ${x + 8} ${y - 8} ${x + 18} ${y - flap}`} stroke="#2a2a2a" strokeWidth={4} fill="none" strokeLinecap="round" />;
      })}
    </g>
  );
}

function Rain({ level, time }: { level: number; time: number }) {
  if (!level) return null;
  return (
    <g opacity={level * 0.8}>
      <rect width={W} height={H} fill="#30405f" opacity={0.18} />
      {Array.from({ length: 90 }).map((_, i) => {
        const x = (random(`rx${i}`) * W + time * 60) % W;
        const y = (random(`ry${i}`) * H + time * 700) % H;
        return <line key={i} x1={x} y1={y} x2={x - 6} y2={y + 22} stroke="#cfe3ff" strokeWidth={2.5} strokeLinecap="round" />;
      })}
    </g>
  );
}

function River({ level, time }: { level: number; time: number }) {
  if (!level) return null;
  const y = GROUND + 120;
  return (
    <g opacity={level}>
      <path d={`M 0 ${y} Q 320 ${y - 30} 640 ${y} T ${W} ${y} V ${H} H 0 Z`} fill="#4aa3df" />
      {Array.from({ length: 10 }).map((_, i) => (
        <path key={i} d={`M ${((i * 140 + time * 80) % (W + 100)) - 50} ${y + 30 + (i % 3) * 18} q 15 -8 30 0`} stroke="#d6f0ff" strokeWidth={4} fill="none" strokeLinecap="round" />
      ))}
      {Array.from({ length: 8 }).map((_, i) => {
        const t = (time * 1.6 + i * 0.37) % 1;
        return <circle key={`d${i}`} cx={560 + i * 22} cy={y - Math.sin(t * Math.PI) * 70} r={6} fill="#9ad4ff" opacity={1 - t} />;
      })}
    </g>
  );
}

function Temple({ x, y, ring, time, night }: { x: number; y: number; ring: number; time: number; night: number }) {
  const swing = ring ? Math.sin(time * 9) * 25 * ring : 0;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-40} y={0} width={80} height={60} fill={interpolateColors(night, [0, 1], ["#f2e3c4", "#5e5468"])} stroke="#3b2a17" strokeWidth={3} />
      <path d="M -50 0 L 0 -55 L 50 0 Z" fill="#d9542b" stroke="#3b2a17" strokeWidth={3} />
      <g transform={`rotate(${swing} 0 8)`}>
        <line x1={0} y1={8} x2={0} y2={24} stroke="#3b2a17" strokeWidth={3} />
        <path d="M -11 38 Q -11 22 0 22 Q 11 22 11 38 Z" fill="#e2b13c" stroke="#3b2a17" strokeWidth={2} />
      </g>
      {ring > 0 && [0, 1, 2].map((i) => {
        const r = 20 + (((time * 1.5 + i / 3) % 1) * 70);
        return <circle key={i} cx={0} cy={30} r={r} fill="none" stroke="#ffd166" strokeWidth={4} opacity={ring * (1 - r / 90)} />;
      })}
    </g>
  );
}

function Footprints({ level }: { level: number }) {
  if (!level) return null;
  const n = Math.ceil(level * 8);
  return (
    <g opacity={level}>
      {Array.from({ length: n }).map((_, i) => (
        <ellipse key={i} cx={120 + i * 60} cy={GROUND + 60 + (i % 2) * 22} rx={11} ry={17} fill="#5a4630" opacity={0.6} transform={`rotate(80 ${120 + i * 60} ${GROUND + 60 + (i % 2) * 22})`} />
      ))}
    </g>
  );
}

function Notes({ level, time }: { level: number; time: number }) {
  if (!level) return null;
  return (
    <g opacity={level}>
      {[0, 1, 2, 3, 4].map((i) => {
        const t = (time * 0.6 + i * 0.2) % 1;
        const x = 430 + i * 30 + Math.sin(t * 6 + i) * 20;
        const y = 280 - t * 220;
        return <text key={i} x={x} y={y} fontSize={48} fill="#ffe27a" stroke="#3b2a17" strokeWidth={1.5} opacity={1 - t}>{i % 2 ? "♪" : "♫"}</text>;
      })}
    </g>
  );
}

function Drum({ level, time }: { level: number; time: number }) {
  if (!level) return null;
  const hit = Math.abs(Math.sin(time * 8));
  return (
    <g opacity={level} transform={`translate(640 ${GROUND - 20}) scale(${1 + hit * 0.08})`}>
      <ellipse cx={0} cy={0} rx={70} ry={34} fill="#b5532d" stroke="#3b2a17" strokeWidth={4} />
      <ellipse cx={-62} cy={0} rx={10} ry={30} fill="#f5e6c8" stroke="#3b2a17" strokeWidth={3} />
      <ellipse cx={62} cy={0} rx={10} ry={30} fill="#f5e6c8" stroke="#3b2a17" strokeWidth={3} />
      <circle cx={0} cy={0} r={60 + hit * 40} fill="none" stroke="#ffd166" strokeWidth={4} opacity={1 - hit} />
    </g>
  );
}

function Sparkles({ level, time }: { level: number; time: number }) {
  if (!level) return null;
  return (
    <g opacity={level}>
      {Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2 + time;
        const r = 120 + Math.sin(time * 4 + i) * 40;
        const x = 640 + Math.cos(a) * r * 2.2;
        const y = 330 + Math.sin(a) * r;
        const s = 8 + Math.abs(Math.sin(time * 6 + i)) * 10;
        return <path key={i} d={`M ${x} ${y - s} L ${x + s / 3} ${y} L ${x} ${y + s} L ${x - s / 3} ${y} Z M ${x - s} ${y} L ${x} ${y + s / 3} L ${x + s} ${y} L ${x} ${y - s / 3} Z`} fill="#ffe066" />;
      })}
    </g>
  );
}

function Leaves({ level, time }: { level: number; time: number }) {
  if (!level) return null;
  return (
    <g opacity={level}>
      {Array.from({ length: 14 }).map((_, i) => {
        const x = ((random(`lx${i}`) * W) + time * 320) % (W + 80) - 40;
        const y = 150 + random(`ly${i}`) * 380 + Math.sin(time * 3 + i) * 30;
        return <ellipse key={i} cx={x} cy={y} rx={10} ry={5} fill="#5aa24a" transform={`rotate(${time * 200 + i * 40} ${x} ${y})`} />;
      })}
    </g>
  );
}

function Door({ level, time }: { level: number; time: number }) {
  if (!level) return null;
  const shake = Math.sin(time * 40) * 3 * level;
  return (
    <g opacity={level} transform={`translate(${170 + shake} ${GROUND - 150})`}>
      <rect x={0} y={0} width={90} height={150} rx={8} fill="#8b5a2b" stroke="#3b2a17" strokeWidth={5} />
      <circle cx={72} cy={80} r={6} fill="#f2c14e" />
    </g>
  );
}

/** A black frame with a round hole of radius r, the classic storybook iris. */
function Iris({ r }: { r: number }) {
  if (r >= 755) return null;
  const cx = W / 2, cy = H / 2 - 20;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <path fillRule="evenodd" fill="#1b1209" d={`M0 0 H${W} V${H} H0 Z M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`} />
    </svg>
  );
}
