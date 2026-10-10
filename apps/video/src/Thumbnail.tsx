import { AbsoluteFill } from "remotion";

export interface ThumbnailProps {
  title: string;
  valueWord: string;
  episodeNo: number;
}

/** YouTube thumbnail (1280x720): banyan, title, value word. Rendered as a still in the browser. */
export function Thumbnail(props: ThumbnailProps) {
  return (
    <AbsoluteFill style={{ background: "#2f6b3a", fontFamily: "Georgia, serif" }}>
      <svg viewBox="0 0 1280 720" style={{ position: "absolute", width: 1280, height: 720 }}>
        <rect width="1280" height="720" fill="#2f6b3a" />
        <circle cx="190" cy="140" r="80" fill="#f2c14e" />
        <ellipse cx="640" cy="620" rx="560" ry="150" fill="#244f2c" />
        <ellipse cx="640" cy="330" rx="480" ry="240" fill="#3a7d46" />
        <rect x="610" y="380" width="60" height="240" fill="#6b4a2f" />
        <circle cx="430" cy="560" r="70" fill="#e8b04b" stroke="#4a3320" strokeWidth="8" />
        <circle cx="850" cy="560" r="55" fill="#c96f4a" stroke="#4a3320" strokeWidth="8" />
      </svg>
      <div style={{ position: "absolute", top: 60, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "#f2c14e", color: "#4a3320", fontSize: 40, padding: "8px 28px", borderRadius: 40 }}>
          Banyan and Beyond · Episode {props.episodeNo}
        </div>
      </div>
      <div style={{ position: "absolute", top: 170, left: 60, right: 60, textAlign: "center", color: "#fff", fontSize: 84, lineHeight: 1.1 }}>
        {props.title}
      </div>
      <div style={{ position: "absolute", bottom: 36, left: 0, right: 0, textAlign: "center", color: "#ffe9c4", fontSize: 44 }}>
        A story of {props.valueWord} for kids
      </div>
    </AbsoluteFill>
  );
}
