import type { PreparedClip } from "@banyan/core";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame } from "remotion";
import { FPS } from "./audio.ts";

export interface BanyanVideoProps {
  title: string;
  themeColor: string;
  moral: string;
  clips: PreparedClip[];
  duration: number;
  mouth: number[];
}

/** Storybook palettes cycled per line so 7 minutes never look static. */
const SKIES = ["#ffe9c4", "#dff0e4", "#e4e9f7", "#f7e4e4"];

const t = (frame: number) => frame / FPS;

function currentClip(clips: PreparedClip[], frame: number) {
  const time = t(frame);
  return clips.find((c) => time >= c.start && time < c.end) ?? null;
}

function Puppet({ speaker, open, x }: { speaker: string; open: number; x: number }) {
  const ajja = speaker === "AJJA";
  return (
    <div style={{ position: "absolute", left: x, top: 300, width: 220, textAlign: "center" }}>
      <div style={{
        width: 150, height: 150, margin: "0 auto", borderRadius: 75,
        background: ajja ? "#e8b04b" : "#c96f4a", border: "6px solid #4a3320",
      }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 22, marginTop: 48 }}>
          <div style={{ width: 18, height: 22, borderRadius: 9, background: "#222" }} />
          <div style={{ width: 18, height: 22, borderRadius: 9, background: "#222" }} />
        </div>
        <div style={{
          width: 54, height: Math.max(4, 26 * open), margin: "14px auto 0",
          borderRadius: 27, background: "#5a2317",
        }} />
      </div>
      <div style={{
        width: 120, height: 130, margin: "-8px auto 0", borderRadius: "40px 40px 18px 18px",
        background: ajja ? "#f5ead0" : "#7fa8c9", border: "6px solid #4a3320",
      }} />
      <div style={{ fontSize: 30, marginTop: 8, color: "#4a3320", fontFamily: "serif" }}>{ajja ? "Ajja" : "Kid"}</div>
    </div>
  );
}

export function BanyanVideo(props: BanyanVideoProps) {
  const frame = useCurrentFrame();
  const time = t(frame);
  const clip = currentClip(props.clips, time);
  const showMoral = time > props.duration - 8;
  const open = props.mouth[Math.min(frame, props.mouth.length - 1)] ?? 0;
  const sky = SKIES[(props.clips.indexOf(clip as PreparedClip) + SKIES.length) % SKIES.length] ?? SKIES[0];

  return (
    <AbsoluteFill style={{ background: "#f7f0dd", fontFamily: "Georgia, serif" }}>
      {/* banyan backdrop */}
      <svg viewBox="0 0 1280 420" style={{ position: "absolute", top: 0, width: 1280, height: 420 }}>
        <rect width="1280" height="420" fill={sky} />
        <circle cx="1060" cy="90" r="52" fill="#f2c14e" />
        <ellipse cx="640" cy="110" rx="430" ry="105" fill="#2f6b3a" />
        <rect x="618" y="170" width="44" height="250" fill="#6b4a2f" />
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={i} x1={430 + i * 70} y1={195} x2={430 + i * 70} y2={330} stroke="#6b4a2f" strokeWidth={9} />
        ))}
        <text x="640" y="52" textAnchor="middle" fontSize="36" fill="#4a3320">{props.title}</text>
      </svg>

      {/* puppets: the current speaker fronts center, the other rests at the side */}
      {clip && (
        <>
          <Puppet speaker={clip.speaker} open={open} x={clip.speaker === "AJJA" ? 300 : 760} />
          <Puppet speaker={clip.speaker === "AJJA" ? "KID" : "AJJA"} open={0} x={clip.speaker === "AJJA" ? 800 : 220} />
        </>
      )}

      {/* captions */}
      <div style={{
        position: "absolute", left: 90, right: 90, bottom: showMoral ? 150 : 40,
        fontSize: 38, lineHeight: 1.35, color: "#2c2318", textAlign: "center", minHeight: 110,
      }}>
        {showMoral
          ? <>Moral of the story: {props.moral}</>
          : clip?.words.map((w, i) => {
            const active = time >= w.start && time < w.end;
            return (
              <span key={i} style={{
                background: active ? "#2f6b3a" : "transparent",
                color: active ? "#fff" : "#2c2318",
                borderRadius: 8, padding: "0 4px",
              }}>{w.text} </span>
            );
          })}
      </div>

      {/* progress bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 14, background: "#d8cba6" }}>
        <div style={{ width: `${Math.min(100, (time / props.duration) * 100)}%`, height: 14, background: "#2f6b3a" }} />
      </div>

      {/* audio */}
      {props.clips.map((c) => (
        <Sequence key={c.index} from={Math.round(c.start * FPS)} durationInFrames={Math.max(1, Math.round((c.end - c.start) * FPS))}>
          <Audio src={c.url} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
