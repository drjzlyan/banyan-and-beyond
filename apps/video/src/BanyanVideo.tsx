import { SFX, endsWithLesson, opensWithJingle, planShots, type ChapterRole, type PreparedClip, type SfxId } from "@banyan/core";
import { useMemo } from "react";
// @remotion/media's Audio: the browser renderer rejects remotion's Html5Audio ("<Html5Audio> is not supported")
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, interpolateColors, spring, useCurrentFrame } from "remotion";
import { ArtScene } from "./ArtScene.tsx";
import { ART } from "./art.ts";
import { FPS } from "./audio.ts";
import { jingleHits } from "./jingle.ts";

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
  /** where this chapter sits in the joined episode video (see core/timeline.ts) */
  role?: ChapterRole;
  chapterCount?: number;
  /** seconds of intro (jingle/sting) before the first line, and of tail/outro after the last */
  intro?: number;
  outro?: number;
  /** the brand jingle cut for this chapter's intro, and the outro reprise (final chapter) */
  jingleUrl?: string | null;
  jingleSeconds?: number;
  outroJingleUrl?: string | null;
  outroJingleSeconds?: number;
  /** quiet looping music bed under the story (ducked while anyone speaks) */
  bedUrl?: string | null;
  bedSeconds?: number;
  /** little interface sounds: a pop for each sound word, a sparkle for the lesson, a whoosh as the iris closes */
  ui?: { pop?: string; sparkle?: string; whoosh?: string } | null;
  /** the story's characters, for caption names and colours */
  cast?: { id: string; name: string; kind: string }[];
};

/** The comic "sound word" shown with each effect, so kids can read along with the sound. */
const SOUND_WORD = (id: SfxId) => SFX[id].word;

/** Caption colours: Ajja brown, the Kid blue, each story character its own. */
const CAST_TONES = ["#b4462b", "#2f7d4a", "#7a3fa0", "#b07a12"];

const W = 1280;
const H = 720;

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
  const role = props.role ?? "single";
  const lesson = endsWithLesson(role);
  const intro = props.intro ?? 3.2;
  const outro = props.outro ?? 8;
  // the lesson card belongs to the end of the whole episode, not to every chapter
  const showMoral = lesson && time > props.duration - outro && props.duration > 20;
  // backdrop behind the scene: evening -> night, a little darker while it rains
  const night = Math.min(1, progress * 1.15 + level("rain") * 0.25);
  const skyBottom = interpolateColors(night, [0, 0.5, 1], ["#fbe0a6", "#e7a98a", "#3a4a78"]);

  const shots = useMemo(
    () => planShots(props.clips, cues, props.duration, { establishSeconds: intro, outroSeconds: lesson ? outro : 0 }),
    [props.clips, cues, props.duration, intro, outro, lesson],
  );
  // the sky moves from afternoon to night across the whole episode, so joined chapters flow on
  const count = props.chapterCount ?? 1;
  const skyProgress = props.chapterCount ? Math.min(1, ((props.chapterNo ?? 1) - 1 + progress) / count) : progress;
  const hits = jingleHits(opensWithJingle(role) ? "intro" : "sting");
  // until the story world is drawn, Ajja performs the characters' lines under the banyan
  const stage = (sp: string) => (sp === "KID" ? "KID" : "AJJA") as "AJJA" | "KID";
  const staged = useMemo(() => props.clips.map((c) => ({ ...c, speaker: stage(c.speaker) })), [props.clips]);
  const castOf = (sp: string) => props.cast?.findIndex((c) => c.id === sp) ?? -1;
  const cueStart = (id: SfxId) => active.find((c) => c.id === id)?.at ?? 0;

  return (
    <AbsoluteFill style={{ background: skyBottom, fontFamily: "'Baloo 2', 'Comic Sans MS', 'Trebuchet MS', sans-serif", overflow: "hidden" }}>
      <ArtScene time={time} progress={skyProgress} clips={staged} shots={shots} speaker={clip ? stage(clip.speaker) : null} open={open}
        excited={clip?.speaker === "KID" && /[?!]\s*$/.test(clip.text)} level={level} cueStart={cueStart} />
      {/* sound words, comic style: a spiky burst pops in with overshoot, wobbles, and shrinks away */}
      {active.map((c, i) => {
        const pop = spring({ frame: frame - Math.round(c.at * FPS), fps: FPS, config: { damping: 8, stiffness: 170 } });
        const wobble = Math.sin((time - c.at) * 9) * 3 * Math.max(0, 1 - (time - c.at) / 1.2);
        return (
          <div key={`${c.id}${c.at}`} style={{
            position: "absolute", left: 90 + ((i * 370 + Math.round(c.at * 53)) % 800), top: 64 + (i % 2) * 70, zIndex: 5,
            transform: `scale(${pop * (0.7 + 0.3 * c.level)}) rotate(${-6 + (i % 3) * 5 + wobble}deg)`, opacity: Math.min(1, c.level * 1.5),
          }}>
            <svg viewBox="0 0 200 100" preserveAspectRatio="none" style={{ position: "absolute", left: -30, top: -26, width: "calc(100% + 60px)", height: "calc(100% + 52px)", overflow: "visible" }}>
              <polygon points={Array.from({ length: 28 }).map((_, k) => { const a = (k / 28) * Math.PI * 2, r = k % 2 ? 0.78 : 1; return `${100 + Math.cos(a) * 100 * r},${50 + Math.sin(a) * 50 * r}`; }).join(" ")}
                fill="#ffd23f" stroke="#3b2a17" strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ position: "relative", background: "#fff7d6", border: "5px solid #3b2a17", borderRadius: 26, padding: "6px 22px",
              fontSize: 46, fontWeight: 800, color: "#c2410c", boxShadow: "6px 6px 0 #3b2a17", whiteSpace: "nowrap" }}>{SOUND_WORD(c.id)}</div>
          </div>
        );
      })}

      {/* caption bubble: pops up with each line, a tail points at the speaker, the spoken word bounces */}
      {!showMoral && clip && (() => {
        const kid = clip.speaker === "KID";
        const ci = castOf(clip.speaker);
        const tone = kid ? "#2563a8" : ci >= 0 ? CAST_TONES[ci % CAST_TONES.length]! : "#8a5a2b";
        const name = kid ? "Kid" : ci >= 0 ? props.cast![ci]!.name : "Ajja";
        const pop = spring({ frame: frame - Math.round(clip.start * FPS), fps: FPS, config: { damping: 13, stiffness: 190 } });
        return (
          <div style={{ position: "absolute", left: 120, right: 120, bottom: 26, display: "flex", justifyContent: "center", zIndex: 6 }}>
            <div style={{ position: "relative", transformOrigin: kid ? "80% 100%" : "20% 100%",
              transform: `translateY(${(1 - pop) * 26}px) scale(${0.92 + pop * 0.08})`, opacity: Math.min(1, pop * 1.6) }}>
              {/* the tail is in the layout (not absolutely offset), so the renderer keeps it inside the bubble's box */}
              <div style={{ display: "flex", justifyContent: kid ? "flex-end" : "flex-start", padding: "0 70px", marginBottom: -7, position: "relative", zIndex: 1 }}>
                <svg width={44} height={30} viewBox="0 0 44 30">
                  <path d={kid ? "M4 30 L34 3 L40 30 Z" : "M40 30 L10 3 L4 30 Z"} fill="#fffbf0" stroke={tone} strokeWidth={5} strokeLinejoin="round" />
                  <rect x={0} y={26} width={44} height={6} fill="#fffbf0" />
                </svg>
              </div>
              <div style={{
                position: "relative", background: "rgba(255,251,240,0.97)", border: `5px solid ${tone}`, borderRadius: 28,
                padding: "10px 26px 14px", fontSize: 44, lineHeight: 1.3, color: "#2c2318", textAlign: "center", maxWidth: 1040, boxShadow: "0 6px 0 rgba(59,42,23,0.18)",
              }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: tone, marginRight: 12 }}>{name}</span>
                {clip.words.map((w, i) => {
                  const lit = time >= w.start && time < w.end;
                  const b = lit ? Math.sin(Math.min(1, (time - w.start) / 0.18) * Math.PI) : 0;
                  return <span key={i} style={{ display: "inline-block", background: lit ? "#f2c14e" : "transparent", borderRadius: 10, padding: "0 4px", marginRight: 10,
                    fontWeight: lit ? 800 : 500, transform: `translateY(${-b * 5}px) scale(${1 + b * 0.06})` }}>{w.text}</span>;
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* storybook iris: opens on the scene, closes at the very end */}
      <Iris r={interpolate(time, [0.3, 1.5], [0, 760], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.5, 0, 0.2, 1) })} />

      {/* opening card, animated on the jingle: chapter 1 gets the full brand intro, others a sting */}
      {time < intro && (() => {
        const t = time, fadeOut = interpolate(t, [intro - 0.6, intro - 0.1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const pop = (at: number, damping = 10) => spring({ frame: frame - Math.round(at * FPS), fps: FPS, config: { damping, stiffness: 160 } });
        // a little bump on each note of "Ban-yan and Be-yond", a big one on the landing
        const bump = hits.words.reduce((m, at) => Math.max(m, t >= at && t < at + 0.22 ? 1 - (t - at) / 0.22 : 0), 0);
        const land = t >= hits.final ? Math.max(0, 1 - (t - hits.final) / 0.5) : 0;
        const first = opensWithJingle(role);
        // the logo arrives alone and bounces on the name-notes; on the landing it lifts and the title ribbon pops in under it
        const ribbonAt = first ? hits.final : hits.words[2]!;
        const ribbon = pop(ribbonAt, 9);
        const lift = interpolate(ribbon, [0, 1], [0, first ? -70 : -55]);
        return (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: fadeOut }}>
            <div style={{ position: "absolute", left: "50%", top: "50%",
              transform: `translate(-50%, -50%) translateY(${lift}px) scale(${pop(hits.words[0]! - 0.15, 11) * (1 + bump * 0.05 + land * 0.08)}) rotate(${-2 + bump * 2}deg)`,
              background: "#fff7d6", border: "6px solid #3b2a17", borderRadius: 36, padding: first ? "26px 40px" : "18px 32px", boxShadow: "10px 10px 0 #3b2a17" }}>
              {/* sized by height so a wide or a tall logo both fit the card */}
              {ART.logo && <Img src={ART.logo} style={{ height: first ? 320 : 230, maxWidth: first ? 560 : 420, objectFit: "contain", display: "block" }} />}
            </div>
            {ribbon > 0.01 && (
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, ${first ? 150 : 115}px) scale(${ribbon})`,
                background: "#2f6b3a", border: "5px solid #3b2a17", borderRadius: 24, padding: "8px 34px 12px", textAlign: "center", boxShadow: "8px 8px 0 #3b2a17", whiteSpace: "nowrap" }}>
                {first && <div style={{ fontSize: 28, color: "#fff4c2", fontWeight: 700 }}>{props.chapterNo ? (props.episodeTitle ?? "Banyan and Beyond") : "Banyan and Beyond"}</div>}
                <div style={{ fontSize: first ? 60 : 54, color: "#ffffff", fontWeight: 800, lineHeight: 1.1 }}>{props.chapterNo ? `Chapter ${props.chapterNo}` : props.title}</div>
              </div>
            )}
            {/* star burst on the landing note */}
            {land > 0 && <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ position: "absolute", inset: 0 }}>
              {Array.from({ length: 14 }).map((_, i) => {
                const a = (i / 14) * Math.PI * 2, r = 200 + (1 - land) * 300;
                return <text key={i} x={W / 2 + Math.cos(a) * r * 1.5} y={H / 2 + Math.sin(a) * r * 0.75} fontSize={48} stroke="#3b2a17" strokeWidth={2} textAnchor="middle" fill={["#f2c14e", "#e4572e", "#5b8e55"][i % 3]} opacity={land}>★</text>;
              })}
            </svg>}
          </div>
        );
      })()}

      {/* moral card */}
      {showMoral && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <div style={{ background: "#fff7d6", border: "6px solid #3b2a17", borderRadius: 36, padding: "28px 48px", maxWidth: 980, textAlign: "center", boxShadow: "10px 10px 0 #3b2a17",
            transform: `scale(${spring({ frame: frame - Math.round((props.duration - outro) * FPS), fps: FPS, config: { damping: 10 } })})` }}>
            <div style={{ fontSize: 36, color: "#c2410c", fontWeight: 800 }}>★ Today's lesson ★</div>
            <div style={{ fontSize: 52, color: "#2c2318", fontWeight: 700, lineHeight: 1.25 }}>{props.moral}</div>
            <div style={{ fontSize: 28, color: "#2f6b3a", fontWeight: 700, marginTop: 12,
              opacity: interpolate(time, [props.duration - outro + 2.5, props.duration - outro + 3.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              See you next time under the banyan tree!
            </div>
          </div>
        </div>
      )}

      {props.duration > 20 && time > props.duration - 1.4 && (
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
      {/* the brand jingle opens every chapter (full on chapter 1, a sting after); the reprise closes the episode */}
      {props.jingleUrl && (
        <Sequence from={0} durationInFrames={Math.round((props.jingleSeconds ?? intro) * FPS)}>
          <Audio src={props.jingleUrl} volume={0.65} />
        </Sequence>
      )}
      {lesson && props.outroJingleUrl && (
        <Sequence from={Math.round((props.duration - outro) * FPS)} durationInFrames={Math.round((props.outroJingleSeconds ?? outro) * FPS)}>
          <Audio src={props.outroJingleUrl} volume={0.65} />
        </Sequence>
      )}
      {/* the music bed runs from the end of the intro to the outro, dipping under every line */}
      {props.bedUrl && (() => {
        const loop = props.bedSeconds ?? 24;
        const from = intro, to = lesson ? props.duration - outro : props.duration;
        return Array.from({ length: Math.max(0, Math.ceil((to - from) / loop)) }).map((_, i) => {
          const at = from + i * loop;
          return (
            <Sequence key={`bed${i}`} from={Math.round(at * FPS)} durationInFrames={Math.round(Math.min(loop, to - at) * FPS)}>
              <Audio src={props.bedUrl!} volume={(f) => bedVolume(at + f / FPS, props.clips, from, to)} />
            </Sequence>
          );
        });
      })()}
      {props.ui?.pop && cues.map((c, i) => (
        <Sequence key={`pop${i}`} from={Math.round(c.at * FPS)} durationInFrames={Math.round(0.35 * FPS)}>
          <Audio src={props.ui!.pop!} volume={0.5} />
        </Sequence>
      ))}
      {props.ui?.sparkle && lesson && (
        <Sequence from={Math.round((props.duration - outro) * FPS)} durationInFrames={Math.round(1.2 * FPS)}>
          <Audio src={props.ui.sparkle} volume={0.6} />
        </Sequence>
      )}
      {props.ui?.whoosh && !lesson && props.duration > 20 && (
        <Sequence from={Math.round((props.duration - 1.4) * FPS)} durationInFrames={Math.round(0.9 * FPS)}>
          <Audio src={props.ui.whoosh} volume={0.5} />
        </Sequence>
      )}
      {/* the evening bed starts once the jingle has had the stage */}
      {props.ambienceUrl && Array.from({ length: Math.ceil(Math.max(0, props.duration - intro) / (props.ambienceSeconds ?? 16)) }).map((_, i) => (
        <Sequence key={`amb${i}`} from={Math.round((intro + i * (props.ambienceSeconds ?? 16)) * FPS)} durationInFrames={Math.round((props.ambienceSeconds ?? 16) * FPS)}>
          <Audio src={props.ambienceUrl!} volume={0.18} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/** Music bed level: fades in after the intro, sits low under speech, lifts a little in the gaps, fades out at the end. */
function bedVolume(t: number, clips: PreparedClip[], from: number, to: number): number {
  const ramp = (x: number) => Math.max(0, Math.min(1, x));
  const edge = Math.min(ramp((t - from) / 1.5), ramp((to - t) / 1.5));
  // distance to the nearest line, in seconds (0 while speaking)
  let d = Infinity;
  for (const c of clips) {
    if (t >= c.start && t < c.end) { d = 0; break; }
    d = Math.min(d, Math.abs(t - c.start), Math.abs(t - c.end));
  }
  const gap = ramp((d - 0.15) / 0.5);
  return edge * (0.16 + 0.16 * gap);
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
