import type { DialogueLine } from "@banyan/core";

export interface ChapterVideoProps {
  title: string;
  themeColor: string;
  lines: { speaker: DialogueLine["speaker"]; text: string; start: number; end: number }[];
  moral: string;
}

/** Storybook chapter scene: banyan backdrop + Ajja & Kid puppets + captions + moral card. */
export function BanyanVideo(props: ChapterVideoProps) {
  const current = props.lines[0];
  return (
    <div style={{ width: 1280, height: 720, background: "#f7f0dd", display: "flex", flexDirection: "column", fontFamily: "serif" }}>
      <svg viewBox="0 0 1280 460" style={{ width: 1280, height: 460 }}>
        <rect width="1280" height="460" fill={props.themeColor} />
        <ellipse cx="640" cy="120" rx="420" ry="110" fill="#2f6b3a" />
        <rect x="620" y="180" width="40" height="280" fill="#6b4a2f" />
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={i} x1={440 + i * 70} y1={200} x2={440 + i * 70} y2={330} stroke="#6b4a2f" strokeWidth={8} />
        ))}
        <circle cx="300" cy="380" r="46" fill="#e8b04b" />
        <circle cx="980" cy="380" r="38" fill="#c96f4a" />
        <text x="640" y="420" textAnchor="middle" fontSize="34" fill="#fff">{props.title}</text>
      </svg>
      <div style={{ padding: 28, fontSize: 40, minHeight: 140 }}>
        {current ? <span><b>{current.speaker === "AJJA" ? "Ajja" : "Kid"}: </b>{current.text}</span> : <span>Under the old banyan tree…</span>}
      </div>
      <div style={{ marginTop: "auto", padding: 20, fontSize: 26, background: "#2f6b3a", color: "#fff" }}>
        Moral: {props.moral}
      </div>
    </div>
  );
}
