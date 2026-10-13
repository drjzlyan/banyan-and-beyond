import { analyzeChapter, isChapterVoiced, type VoiceSettings } from "@banyan/core";
import { useMemo, useState } from "react";
import type { ChapterRow } from "./api.ts";
import { StatusPill, fmtMin, usePlayer } from "./ui.tsx";

interface StoredClip { speaker: "AJJA" | "KID"; text: string; duration: number; url: string; voice?: string }

/** One chapter: health analysis, line-by-line listening at the chosen pitch, and its actions. */
export function ChapterCard(props: {
  row: ChapterRow;
  voices: VoiceSettings;
  locked: boolean;
  phase?: string;
  pct?: number;
  onRender: () => void;
  onRegenerate: () => void;
  onRevoice: () => void;
}) {
  const { row, voices } = props;
  const [open, setOpen] = useState(false);
  const player = usePlayer();
  const clips = useMemo(() => JSON.parse(row.clips_json || "[]") as StoredClip[], [row.clips_json]);
  const a = useMemo(() => analyzeChapter(row.spoken, {
    clipDurations: clips.map((c) => ({ speaker: c.speaker, duration: c.duration })),
    ajjaPitch: voices.ajjaPitch, kidPitch: voices.kidPitch, finalChapter: row.idx === 7,
  }), [row.spoken, row.idx, clips, voices.ajjaPitch, voices.kidPitch]);
  const voiced = isChapterVoiced(row.status);
  const lines = row.spoken ? row.spoken.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  // clips voiced before the Voice Lab carry no voice field; they were all Luna
  const oldVoices = [...new Set(clips.map((c) => c.voice ?? "luna"))]
    .filter((v) => v !== voices.ajjaVoice && v !== voices.kidVoice);
  const rate = (s: string) => (s === "KID" ? voices.kidPitch : voices.ajjaPitch);

  function playFrom(i: number) {
    const c = clips[i];
    if (!c) return;
    player.play(`l${i}`, c.url, rate(c.speaker), () => playFrom(i + 1));
  }

  const phaseLabel = props.phase === "preparing" ? "Preparing audio…" : props.phase === "rendering" ? `Rendering ${Math.round((props.pct ?? 0) * 100)}%` : props.phase === "uploading" ? `Uploading ${Math.round((props.pct ?? 0) * 100)}%` : null;

  return (
    <div className="card">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>Chapter {row.idx + 1}</h3>
        <div className="row">
          {/* legacy rows say "rendered" once voiced; only a video makes a chapter truly rendered */}
          <StatusPill status={row.status === "rendered" && !row.video_key ? "voiced" : row.status} chapter />
          {row.video_key && <span className="pill ok">video ✓</span>}
        </div>
      </div>

      {!row.spoken ? (
        <p className="muted small">Not scripted yet. The nightly cron (22:00 UTC) scripts and voices chapters in order, about one chapter every two nights.</p>
      ) : (
        <>
          <div className="stats">
            <div className="stat"><b>{fmtMin(a.pitchedSeconds)}</b><span>{a.secondsEstimated ? "est. length" : "length at your pitch"} · target 7:30</span></div>
            <div className="stat"><b>{a.words}</b><span>words · {a.lines} lines</span></div>
            <div className="stat"><b>{a.ajjaLines} / {a.kidLines}</b><span>Ajja / Kid lines</span></div>
            <div className="stat"><b>{clips.length}/{a.lines}</b><span>lines voiced</span></div>
            <div className="stat"><b>{a.nightsToVoice}</b><span>nights to voice ({a.ttsChars} chars)</span></div>
          </div>
          <div className="bar" aria-label="voicing progress"><i style={{ width: `${a.lines ? (clips.length / a.lines) * 100 : 0}%` }} /></div>
          {(a.problems.length > 0 || a.warnings.length > 0 || oldVoices.length > 0) && (
            <ul className="small" style={{ margin: "10px 0 0", paddingLeft: 18 }}>
              {a.problems.map((p) => <li key={p} style={{ color: "var(--bad)" }}>{p}</li>)}
              {a.warnings.map((w) => <li key={w} style={{ color: "var(--warn)" }}>{w}</li>)}
              {oldVoices.length > 0 && <li style={{ color: "var(--warn)" }}>voiced with {oldVoices.join(", ")}, which isn't a current voice; use Re-voice to match</li>}
            </ul>
          )}
        </>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={props.onRender} disabled={!!props.phase || !voiced || props.locked}
          title={voiced ? "Render this chapter in your browser and upload the MP4" : "Wait until the chapter is fully voiced"}>
          {phaseLabel ?? (row.video_key ? "Re-render" : "Render + upload")}
        </button>
        {clips.length > 0 && (player.playing
          ? <button className="btn" onClick={player.stop}>■ Stop</button>
          : <button className="btn" onClick={() => playFrom(0)}>▶ Listen</button>)}
        {lines.length > 0 && <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide script" : "Script"}</button>}
        <button className="btn" disabled={props.locked || !voiced} onClick={props.onRevoice} title="Same script, current voices">Re-voice</button>
        <button className="btn danger" disabled={props.locked} onClick={props.onRegenerate}>New script</button>
      </div>

      {open && (
        <ol className="script">
          {lines.map((l, i) => {
            const m = l.match(/^(AJJA|KID):\s*(.+)$/);
            const who = m?.[1] ?? "?";
            return (
              <li key={i} className={`${player.playing === `l${i}` ? "playing" : ""} ${a.hookLines.includes(i + 1) ? "hook" : ""}`}>
                <button className="btn tiny" aria-label={`Play line ${i + 1}`} disabled={!clips[i]}
                  onClick={() => (player.playing === `l${i}` ? player.stop() : player.play(`l${i}`, clips[i].url, rate(clips[i].speaker)))}>
                  {player.playing === `l${i}` ? "■" : "▶"}
                </button>
                <span className={`who ${who}`}>{who === "AJJA" ? "Ajja" : who === "KID" ? "Kid" : who}</span>
                <span>{m?.[2] ?? l}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
